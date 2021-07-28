---
title: lab0
date: 2021-05-31 14:14:11
permalink: /pages/be71bd/
categories:
  - labbb
  - uCore
tags:
  - 
---
# uCore_lab0_环境搭建

[[toc]]

## 基本工具使用

### gcc编译c文件

gcc编译c语言文件：

```sh
gcc -Wall hello.c -o hello
```

编译选项：

`-o $name`指定编译出的文件文件名， 

`-Wall`开启编译器警告， 
### gcc汇编语法-AT&A

首先gcc默认汇编语法为`AT&T`格式，

* 寄存器命名原则
  AT&T: %eax                      Intel: eax

* 源/目的操作数顺序 
  AT&T: movl %eax, %ebx           Intel: mov ebx, eax

* 常数/立即数的格式　
  AT&T: movl $_value, %ebx        Intel: mov eax, _value
  把value的地址放入eax寄存器
  AT&T: movl $0xd00d, %ebx        Intel: mov ebx, 0xd00d

* 操作数长度标识 
  AT&T: movw %ax, %bx             Intel: mov bx, ax

* 寻址方式 
  AT&T:   immed32(basepointer, indexpointer, indexscale)
  Intel:  [basepointer + indexpointer × indexscale + imm32)

* 直接寻址 
		AT&T:  foo 		Intel: [foo]
      boo是一个全局变量。注意加上$是表示地址引用，不加是表示值引用。对于局部变量，可以通过堆栈指针引用。

* 寄存器间接寻址 
        AT&T: (%eax)		 Intel: [eax]

* 变址寻址 
		AT&T: _variable(%eax)
		Intel: [eax + _variable]
		AT&T: _array( ,%eax, 4)
		Intel: [eax × 4 + _array]
		AT&T: _array(%ebx, %eax,8)
		Intel: [ebx + eax × 8 + _array]	

### gcc基本内联汇编

单行一般使用`asm asm_qualifiers ( AssembleInstructions );`的形式，  

asm_qualifiers为以下两个修饰符：

* volatile: 标识编译期不要对asm代码进行优化，
* inline: 标识编译器尽可能小的假设asm指令大小

另外`asm`并不是标准c语言中的关键字， 在gcc编译器中可以使用`__asm__`, 后者可以通过-std=c99 等启用 ISO C 的编译选项时的编译，前者不行，

多行一般其中的每一行末尾加`"\n\t"`， 

```c
asm(
    "pushl %eax\n\t"
    "movl $0, %eax\n\t"
    "pop %eax"
)
```

另外， 编译器其实并不会处理内联汇编，而是直接把他们插入到编译出的汇编指令中， 然后直接交给汇编器做后面的任务。

编译器不解析 asm 块中的指令的一个推论是：GCC 对我们插入的指令毫不知情。这相当于我们人为地干涉了 GCC 自动的代码生成。

### gcc拓展内联汇编

拓展内联汇编的语法格式大体有下面两种形式， 

```c
asm asm-qualifiers ( AssemblerTemplate 
                 : OutputOperands 
                 [ : InputOperands
                 [ : Clobbers ] ])

asm asm-qualifiers ( AssemblerTemplate 
                      : OutputOperands
                      : InputOperands
                      : Clobbers
                      : GotoLabels)
```

`asm`, `asm-qualifiers`和基本内联汇编基本相同，

基本内联汇编中提供了在汇编中跳转到c标签的能力， `asm-qualifiers`增加了`goto`，(只能用于第二种形式)

`AssemblerTemplate`是程序员编写的汇编指令，

可以将拓展内联汇编asm块看作一个黑盒， 我们给定变量、表达式作为输入，制定变量作为输出，指明我们指令的作用， 运行后这个黑盒会自动按照我们的要求进行处理，

`OutuputOperrands` 表示输出变量， 一般在汇编语句中使用`%0`表示， 在对应的位置使用`:"=flag"(var)`， 

`InputOperands`表示输入变量， 在汇编语句中使用`%1`开始递增标识， 在对应的位置使用`:"flag"(var), "flag"(var2)`通过`，`分隔多个变量

`Clobbers`表示副作用(在asm块没有指定但是运行中可能修改的寄存器内存等),对应位置使用`:"flag1", "flag2"`标识，可能存在多种数据使用`,`分隔，

flag标识， 主要是约束字母，标识对应含义：

| 字母       | 含义                                             |
| ---------- | ------------------------------------------------ |
| m, v, o    | 内存单元                                         |
| R          | 任何通用寄存器                                   |
| Q          | 寄存器eax, ebx, ecx,edx之一                      |
| I, h       | 直接操作数                                       |
| E, F       | 浮点数                                           |
| G          | 任意                                             |
| a, b, c, d | 寄存器eax/ax/al, ebx/bx/bl, ecx/cx/cl或edx/dx/dl |
| S, D       | 寄存器esi或edi                                   |
| I          | 常数（0～31）                                    |




## 基本知识

### 8086运行模式

intel 8086处理器有四种运行模式： 实模式， 保护模式， smm模式， 虚拟8086模式

实模式， 

处理器早期使用的简单运行模式， 8086处理器加电后就处于实模式运行，这种状态下软件可以访问的物理空间不超过1m, 程序的代码和数据位于不同的区域， 操作系统和用户程序并没有区别对待。

> 其实这是intel x86向下兼容的需求，对于arm mips等架构结没有实模式，只有类似保护模式的cup模式，

保护模式： 

保护模式的主要目标其实是保证应用程序不能对操作系统进行破坏，

在实模式下初始化控制寄存器(GDTR, LDTR, IDTR, TR)， 和页表， 然后设置CR0寄存器， 进入8086保护模式，

在保护模式下，物理寻址空间可以达到4G， 支持分页机制， 提供了对于虚拟内存的良好支持，保护模式下支持多任务还支持优先级模式，不同的程序可以运行在不同的特权级别，特权级一共分为0-3四个级别，操作系统运行在最高特权0级别上，

这个模式配合良好的检测机制， 可以实现任务间数据的安全共享， 也可以良好的隔离各个任务，

#### 内存寻址的区别

最主要的区别就是内存寻址的区别,

保护模式下寻址增加到4g, 同时开启分段机制, 

实模式下的地址使用 CS:ip的形式, `(CS << 4) | ip`

保护模式下使用分段机制, `GDT[CS >> 3] + ip`

### 8086内存架构

地址是访问内存空间的索引，一般来说内存地址有两个，一个是cpu通过总线访问物理内存用到的物理地址， 一个是我们编写应用程序用到的逻辑地址(虚拟地址)

8086中还有线性地址的概念，这是处理器通过段机制控制形成的地址空间，在操作系统管理下每个运行的程序有相对独立的一个或多个内存空间段，每个段都有各自的起始地址和长度属性，这样实现应用程序的隔离，实现对地址空间的保护。

操作系统会进行对处理器段机制的初始化和配置，(主要是完成虚拟地址和线性地址的映射)，处理器的段管理功能单元负责吧虚拟地址转化成线性地址， 如果不开启页机制，这个线性地址就是物理地址，

段机制主要是解决对程序分散使用内存的支持能力弱， 增加叶机制，每个叶大小是固定的(4k)， 完成对内存单元保护隔离，而且可以有效的支持大量程序分散使用大内存的情况。



上述三种地址的关系如下：

- 分段机制启动、分页机制未启动：

    逻辑地址--->***段机制处理\***--->线性地址=物理地址

- 分段机制和分页机制都启动：

    逻辑地址--->***段机制处理\***--->线性地址--->***页机制处理\***--->物理地址

    

* 段机制处理

分段地址转换，逻辑地址(段选择子selector和段偏移offset组成)， 段选择子内容作为段描述符表的索引，找到表中对应的段描述符， 然后把段描述符中保存的段基址加上段偏移， 形成线性地址，

> 这里前提是保护模式，并注意需要建立段描述符和段描述符表。



### 寄存器

通用寄存器： eax, ebx, ecx, edx, esi, edi, esp, ebp, 

段寄存器：cs(code segment), ds(data segment), es(extra segment), ss(stack segment), fs, gs, 

指令寄存器, eip，保存的是下一条要执行指令的内存地址，在分段地址转换中表示指令的段内偏移地址，

标识寄存器， efalgs, 

另外是cr0等不能被访问的控制寄存器，

