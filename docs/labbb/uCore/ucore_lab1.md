---
title: lab1
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

static void
switch_to_user(struct trapframe *tf) {
    if(tf->tf_cs  != USER_CS){
        tf->tf_cs = USER_CS;
        tf->tf_es = tf->tf_ds = tf->tf_ss = tf->tf_gs = tf->tf_fs = USER_DS;
        tf->tf_eflags |= FL_IOPL_MASK;
    }
}

static void
switch_to_kernel(struct trapframe * tf) {
    if(tf->tf_cs  != KERNEL_CS){
        tf->tf_cs = KERNEL_CS;
        tf->tf_es = tf->tf_ds = tf->tf_ss = tf->tf_gs = tf->tf_fs = KERNEL_DS;
        tf->tf_eflags &= ~FL_IOPL_MASK;
    }
}
```

### 练习2

直接调用对应的函数即可.

```c
        c = cons_getc();
        if (c == '3'){
            // k2u
            switch_to_user(tf);
            print_trapframe(tf);
        }
        if (c == '0'){
            // u2k
            switch_to_kernel(tf);
            print_trapframe(tf);
        }
```

