---
title: ucore_lab1
date: 2021-06-02 12:49:46
permalink: /pages/cfd3c4/
categories:
  - labbb
  - uCore
tags:
  - 
---
#  lab1-boot

## 基础知识

### boot启动

当计算机加电以后， 一般不会直接执行操作系统，而是执行系统初始化软件并完成基本的io初始化和引导加载功能，

bios是被固化在计算机rom芯片上的一个特殊软件， 

计算机加电后，cpu从物理内存地址0xfffffff0地址开始执行(cs:eip), 开始执行，这个地址之放置了一个跳转指令，通过跳转指令跳到bios程序起点，bios进行计算机硬件自检和初始化以后， 会选择一个启动设备， 并读取该设备的第一个扇区(引导扇区 512byte)到内存0x7c00位置，并跳转过去执行，

此时就从bios转入到程序的bootloader运行，

### bootloader 

bootloader的主要功能是把操作系统的代码读入到内存中并跳转到操作系统的代码中运行，

这里用操作系统对应的loader加载操作系统， 而不从bios中直接加载操作系统，可以兼容不同操作系统的文件系统，

bootloader完成的工作包括： 

* 切换到保护模式，启动分段机制
* 读磁盘中的elf执行文件格式的ucore操作系统到内存
* 显示字符串信息
* 吧控制权交给ucore操作系统

从bootloader接手bios工作以后， 当前的pc系统处于实模式(16位模式)运行状态，在这种状态下软件可访问的物理内存空间不超过1m, 我们在lab0写了关于系统模式的区别，

### 保护模式

实模式到保护模式的切换，

* 通过修改A20地址线可以拓展寻址大小，达到保护模式需要的寻址大小, 

    其实是向8042键盘控制器发送对应的output port数据即可, 但是输入数据规则是先向64h端口写入0xd1, 然后向60h端口写入output port数据, 同时要等待两个端口缓冲区没有数据才行, 因此写了两个循环和两次发送数据.

* 设置gdt表

    这个是为了启动分段机制,

* 设置cr0寄存器

    汇编代码可以直接修改,

注意的是切换到保护模式以后需要一个长跳转指令跳到下一段代码, 并借此修改cs的值

### 磁盘访问

bootloader的访问硬盘都是LBA模式的PIO（Program IO）方式，即所有的IO操作是通过CPU访问硬盘的IO地址寄存器完成。

| O地址 | 功能                                                         |
| ----- | ------------------------------------------------------------ |
| 0x1f0 | 读数据，当0x1f7不为忙状态时，可以读。                        |
| 0x1f2 | 要读写的扇区数，每次读写前，你需要表明你要读写几个扇区。最小是1个扇区 |
| 0x1f3 | 如果是LBA模式，就是LBA参数的0-7位                            |
| 0x1f4 | 如果是LBA模式，就是LBA参数的8-15位                           |
| 0x1f5 | 如果是LBA模式，就是LBA参数的16-23位                          |
| 0x1f6 | 第0~3位：如果是LBA模式就是24-27位 第4位：为0主盘；为1从盘    |
| 0x1f7 | 状态和命令寄存器。操作时先给命令，再读取，如果不是忙状态就从0x1f0端口读数据 |

一般的方案是， 先等待磁盘准备好，然后设置对应的命令，设置好扇区，然后再次等待磁盘准备好，然后把磁盘数据读取到指定内存中。

### 函数调用规则

在汇编层的函数调用规则这里也要清楚，基本就是 `call` 和`ret`指令， 

简单来讲就是 `call target`指令相当于 `push $+5; jmp target`， 然后在调用之前会进行参数的压栈， 这里编写的是32位的系统， 因此参数全部使用栈进行传递。

## 系统中断处理

### int n指令

在这里我们也会看到关于 `int n`系列的中断处理，

在32位intel cpu上，使用` int n`汇编指令会产生软件中断， 系统立刻切入内核状态，然后通过` idt (interrupt descriptor table)`查找对应的中断处理函数 `idt[n].handler`， 然后跳转过去运行，  运行结束以后通过 `iret`可以回到中断产生的位置继续运行。

这里的 `int n  + iret`其实和我们前面看到的`call + ret`其实是一致的，都是通过栈储存返回的位置。

注意这里有一个坑点，我们使用 `int n `进入处理函数的时候有以下两种情况: 

* 从用户态产生的话会依次压入 `ss, esp, eflags, cs, eip`， 
* 从内核态产生的话会依次压入 `eflags, cs, eip`

对于`iret`来说也是如此， 按照cs和当前cs可以看出返回到什么状态， 从而决定是否有 `ss esp`两个寄存器弹出。

###  相关函数

那么我们再来看下ucore中对于中断的处理函数， 

在最开始初始化 idt， 指向 `kernel/trap/vectors.S`文件中的`__verctors`数组，其中每一个元素都是一个处理函数， 只是简单的压入中断的号码然后跳转到 `__alltraps`位置，这段汇编定义在 `kernel/trap/trapentry.S`文件中， 

作用是继续保存各种寄存器， 然后设置 ds es为`GD_KDATA`即全部转入到内核态运行，(在 `int n`指令运行的时候cpu已经按照 `idt[n]`设置好了cs寄存器)， 最后 `push esp`跳转到 `trap`函数运行， 

注意这个位置， 其实这个`esp`指向的是刚刚压入栈的各种寄存器信息，对应的的`trap`函数的参数 `struct trapframe`， 

```c
/* registers as pushed by pushal */
struct pushregs {
    uint32_t reg_edi;
    uint32_t reg_esi;
    uint32_t reg_ebp;
    uint32_t reg_oesp;            /* Useless */
    uint32_t reg_ebx;
    uint32_t reg_edx;
    uint32_t reg_ecx;
    uint32_t reg_eax;
};

struct trapframe {
    struct pushregs tf_regs;
    uint16_t tf_gs;
    uint16_t tf_padding0;
    uint16_t tf_fs;
    uint16_t tf_padding1;
    uint16_t tf_es;
    uint16_t tf_padding2;
    uint16_t tf_ds;
    uint16_t tf_padding3;
    uint32_t tf_trapno;
    /* below here defined by x86 hardware */
    uint32_t tf_err;
    uintptr_t tf_eip;
    uint16_t tf_cs;
    uint16_t tf_padding4;
    uint32_t tf_eflags;
    /* below here only when crossing rings, such as from user to kernel */
    uintptr_t tf_esp;
    uint16_t tf_ss;
    uint16_t tf_padding5;
} __attribute__((packed));
```

接下来根据 `tf->trapno`可以进行各种中断的分发，

然后通过修改内部的`fs, es, ds`可以在返回trap函数后的恢复寄存器中进行寄存器修改等操作。

`trap`函数返回以后，首先 `pop esp`， 弹出刚刚的tf， 然后逐步恢复寄存器，最后使用`iret`返回。 

## 内核-用户 状态切换

对于用户和内核状态切换，其实只需要更改 tf的数据即可，主要是 `ds es cs`这三个，然后`eflags`要保证io的权限。

但是另一个问题出在我们前面提到的在两种状态进入内核的时候 `int n`和`iret` 表现是不一的， 

简单来说， 用户态返回时需要 `ss esp`而内核态不需要，那么这个数据如果多了或少了都会导致崩溃。

于是我们要记得， 在用户态切入内核态， 最后会多出一段栈， 从内核态切入用户态会有一段内存少了导致esp错误，

### 切换时维护

那么 其实如果在状态切换的函数最后增加个 `mov ebp, esp`即可恢复esp， 然后内核切入用户态在函数前增加 `sub esp, 8`给出这段空间即可。

这是在入口函数进行处理的方案， 大概结果如下， 

```c
static void
lab1_switch_to_user(void) {
    //LAB1 CHALLENGE 1 : TODO
    asm volatile (
        "sub $0x8, %%esp \n"
        "int %0 \n"
        "movl %%ebp, %%esp"
        : 
        : "i"(T_SWITCH_TOU)
    );
}

static void
lab1_switch_to_kernel(void) {
    //LAB1 CHALLENGE 1 :  TODO
	   asm volatile (
	       "int %0 \n"
	       "movl %%ebp, %%esp"
	       : 
	       : "i"(T_SWITCH_TOK)
	   );
}
```

### 中断内维护

这个就是在中断时进行维护， 基本需要我们修改整个trapframe， 

修改的方法是，我们已经知道`tf`位置就是栈上， 而这个数据当作参数传递也是在栈上，  进入`trap`函数前的那句`push esp`， 因此我们可以通过 `*(uint32_t *)(tf - 1) = new_tf`修改整个tf, 在trap函数返回以后的 `pop esp`中整个栈都会是这个被修改的 new_tf， 

于是我们的内核切换到用户态的时候，要设置好 `ss, esp`寄存器，这个`esp` 寄存器默认是没有值的， 但是根据一步步运行过来的偏移量， 其实切换到` & tf->tf_esp`位置即可，

> 因为是内核切换过来的，所以int n运行以后压入了 eflag cs eip， 因此原本的栈应该就是 tf->tf_eflags下面一个。

从用户态切换到内核态的时候，因为原本应该是 iret返回时切换esp到指定的位置，而现在iret不设置esp了，于是我们也要保证iret以后esp应该和原本一致， 于是在esp之前放置整个`new_tf`， 逐步返回， 最后正好回到原本预设的esp位置。

## 练习 

### 练习1

#### makefile

查看makefile并理解，

直接使用`make`会进行编译，使用`make V=""`会打印更加详细的信息



准备工作，初始化，

最开始先是设置了项目名字等，变量V设置是为了进行打印，

然后设置`GCCPRETIX`和`QEMU`， 检查对应信息，主要是获取objdump和qemu是否有对于32位elf的支持，

而后大片的设置变量，包括`CC` `CFLAGS`等，

然后`include`进来一个`function.mk`， 里面是一些设置好的函数， 此后的makefile中大量使用，

准备工作结束，接下来的代码编译阶段，

然后是kernel部分的代码，设置了几个准备数据，然后设置kernel的编译链接和导出符号的过程，当后面需要编译kernel的时候会激活这个链接过程，

接着是bootblock， 和上面基本一致，先编译出目标文件，然后需要时才会链接和导出符号表，但是另一个小问题这里bootblock使用`sign`复制到bin中， 

sign在接下来就被编译了，他的作用是先检测bootblock的大小要小于500，然后在最后增加`0x55, 0xaa`的标识位， 然后复制到对应目录，

 最后是`ucore.img`文件，使用dd指令吧对应的文件合并为一个，

编译部分结束，后面开始是target部分， 

all: 对应直接使用make的时候，就是编译出`ucore.img`， 

lab1-mon使用qemu的monitor模式保存log记录，并运行一个gdb进行调试

debug-mon: 使用qemu的monitor和gdb配合调试

qemu: 使用qemu混合模式

qemu-mon:使用qemu monitor模式

qemu-nox:使用qemu 命令行模式

#### bug 

在我的机器(archlinux)上运行make的过程中， 会出现bootblock大小为138M的情况，会再sgin的位置报错， 

我使用了一个ubuntu16的docker逐步运行发现是`objcopy`位置出现的问题， 进一步分析两个系统同样的`objcopy`指令运行出的文件，发现本地填充大量00, 进一步通过readelf解析文件，观察现docker内只保存了text eh_frame date三个段，于是在本地中通过-j参数指定，问题解决

```bash 
# 原来
$(V)$(OBJCOPY) -S  -O binary $(call objfile,bootblock) $(call outfile,bootblock)

# 修改
$(V)$(OBJCOPY) -S -I elf32-i386 -O binary -j .text -j .eh_frame -j .data $(call objfile,bootblock) $(call outfile,bootblock)
```

#### 了解

* 一个被系统认为是符合规范的硬盘主引导扇区的特征是什么？

可以在`/tool/sign.c`代码中看到， 

```c
  buf[510] = 0x55;
  buf[511] = 0xAA;
  FILE *ofp = fopen(argv[2], "wb+");
  size = fwrite(buf, 1, 512, ofp);
  if (size != 512) {
    fprintf(stderr, "write '%s' error, size is %d.\n", argv[2], size);
    return -1;
  }
```

特征是最后两个字节`\x55\xaa`， 且大小为512字节。

### 练习2

#### debug

使用qemu可以参考makefile 中已经给定的语句，增加-S -s 可以开启gdb远程调试的端口1234, 然后启动gdb, gdb指令`target remote :1234`可以连接到远程端口，然后在0x7c00位置下断点，即可开始调试

```sh
# lab1init
file bin/kernel
set architecture i8086
target remote :1234
b * 0x7c00
continue
```

### 练习3

#### bootasm.S

注释比较充足，我们可以看到这段汇编主要工作：

* 首先禁用中断，
* 然后初始化ds, es, ss段寄存器
* 然后开启a20扩大寻址空间
* 初始化gdt表
* 设置cr0切换到保护模式
* 跳到下一部分(这里使用了一个jmpl, 因为这里开始是保护模式开启后的第一句)
* 再次初始化ds,es,fs, gs, ss寄存器，初始化栈， 跳转到bootmain函数运行，进入c语言部分



#### 了解

- 为何开启A20，以及如何开启A20

开启A20扩大寻址空间，寻址可以达到4g线性地址空间和物理地址空间。

- 如何初始化GDT表

`lgdt gdtdesc`

- 如何使能和进入保护模式

开启a20， 初始化GDT表， 设置cr0寄存器。

### 练习4

#### bootmain.c

分析代码， 主要是在`readsect`函数实现磁盘访问，然后包装为`readseg`函数，实现内存读取，

在bootmain函数中首先读取elf头进来，并获取到程序头表，然后吧elf中的每个段依次读取进来。

#### 了解

- bootloader如何读取硬盘扇区的？

```c
/* waitdisk - wait for disk ready */
static void waitdisk(void) {
  while ((inb(0x1F7) & 0xC0) != 0x40)
    /* do nothing */;
}

/* readsect - read a single sector at @secno into @dst */
static void readsect(void *dst, uint32_t secno) {
  // wait for disk to be ready
  waitdisk();

  outb(0x1F2, 1); // count = 1
  outb(0x1F3, secno & 0xFF);
  outb(0x1F4, (secno >> 8) & 0xFF);
  outb(0x1F5, (secno >> 16) & 0xFF);
  outb(0x1F6, ((secno >> 24) & 0xF) | 0xE0);
  outb(0x1F7, 0x20); // cmd 0x20 - read sectors

  // wait for disk to be ready
  waitdisk();

  // read a sector
  insl(0x1F0, dst, SECTSIZE / 4);
}
```



- bootloader是如何加载ELF格式的OS？

```c
/* bootmain - the entry of bootloader */
void bootmain(void) {
  // read the 1st page off disk
  readseg((uintptr_t)ELFHDR, SECTSIZE * 8, 0);

  // is this a valid ELF?
  if (ELFHDR->e_magic != ELF_MAGIC) {
    goto bad;
  }

  struct proghdr *ph, *eph;

  // load each program segment (ignores ph flags)
  ph = (struct proghdr *)((uintptr_t)ELFHDR + ELFHDR->e_phoff);
  eph = ph + ELFHDR->e_phnum;
  for (; ph < eph; ph++) {
    readseg(ph->p_va & 0xFFFFFF, ph->p_memsz, ph->p_offset);
  }
```

### 练习5

栈帧的原理, 比较简单.

```c
void
print_stackframe(void) {
    uint32_t ebp = read_ebp();
    uint32_t eip = read_eip();
    for(int i=0; i < STACKFRAME_DEPTH; i++){
        uint32_t *tmp = (uint32_t *)ebp;
        cprintf("ebp: 0x%08x eip: 0x%08x args:0x%08x 0x%08x 0x%08x 0x%08x", ebp, eip, *(tmp+2), *(tmp+3), *(tmp+4), *(tmp+5));
        cprintf("\n");
        print_debuginfo(eip-1);
        ebp = tmp[0];
        eip = tmp[1];
    }
}
```

### 练习6

填充idt表, 并在载入idt表, 按照setgate的格式写入即可, 

```c
    for(int i=0; i<256; i++){
        if ((i == T_SYSCALL) || (i == T_SWITCH_TOK)){
            SETGATE(idt[i], 0, GD_KTEXT, __vectors[i], DPL_USER);
        }else{
            SETGATE(idt[i], 0, GD_KTEXT, __vectors[i], DPL_KERNEL);
        }
    }

    lidt(&idt_pd);
```

时钟这里比较简单:

```c
        ticks ++;
        if (ticks % TICK_NUM == 0){
            print_ticks();
            ticks = 0;
        }
        break;
```



## 拓展练习

### 练习1 

切换, 对于段寄存器切换即可, 然后后续的输入输出需要eflag寄存器的io权限位

```c
struct trapframe frame_utk, frame_ktu;

void switch_to_user(struct trapframe *tf) {
  if (tf->tf_cs == KERNEL_CS) {
    frame_ktu = *tf;
    frame_ktu.tf_cs = USER_CS;
    frame_ktu.tf_ds = frame_ktu.tf_es = frame_ktu.tf_ss= USER_DS;
    frame_ktu.tf_eflags |= FL_IOPL_MASK;

    frame_ktu.tf_esp = (uint32_t)tf + sizeof(struct trapframe) - 8;

    *((uint32_t *)tf - 1) = (uint32_t)&frame_ktu;
  }
}

void switch_to_kernel(struct trapframe *tf) {
  if (tf->tf_cs == USER_CS) {
    frame_utk = *tf;
    frame_utk.tf_cs = KERNEL_CS;
    frame_utk.tf_ds = frame_utk.tf_es = KERNEL_DS;
    // frame_utk.tf_esp = tf->tf_esp;
    frame_utk.tf_eflags &= ~FL_IOPL_MASK;

    uint32_t offset = (uint32_t)(tf->tf_esp  - (sizeof(struct trapframe) - 8));
    memmove(offset, &frame_utk, sizeof(struct trapframe) - 8);
    *((uint32_t *)tf - 1) = offset;
  }
}
```

