---
title: shellcode
date: 2021-08-24 18:24:19
permalink: /pages/c1bf02/
categories:
  - book
  - pwn
tags:
  - 
---
#  shellcode & seccomp

简单整理下shellcode类型的题目

[[toc]]

## shellcode原理

shellcode 本意是指 一段字节码, 输入以后程序会运行这段代码,  达到getshell的目的, 

ctf pwn题中我们的目的是读取flag,  

使用shellcode的话也分为两种情况,  

* getshell
* 使用open read write (orw)

其实两者的原理是一致的, 都是通过系统调用实现对应功能,

[系统调用表](https://syscalls.w3challs.com/),  常用的是 [x86](https://syscalls.w3challs.com/?arch=x86)和[x86-64](https://syscalls.w3challs.com/?arch=x86_64)的, 

## shellcode使用场景

重要的其实就是, 要能有个可写可执行的地址, 另该我们可以运行到这个地址去执行我们的输入, 就可以使用shellcode, 

对于栈题目来说,一般都是使用rop, 堆题目一般通过控制hook位来getshell, 但是开启沙箱使用orw的使用一般会考虑shellcode/srop, 

另外一些就是比较明显的考察shellcode编写的题目, 一般这种也会对shellcode本身增加各种限制,  或者使用沙盒对系统调用进行限制.

## 对shellcode本身无限制

就普通的getshell或者orw, 

其实可以直接使用[pwntools的shellcraft](https://docs.pwntools.com/en/stable/shellcraft.html), 或者生成以后自己修改下, 

使用pwntools中的asm函数, 将汇编shellcode编译,  输出为bytes类型, 

```python
context.arch = "amd64" 
# 这里要指定, 不然asm默认使用i386, 编译会报错, 
asm("mov rax, 1")
```

这个shellcraft工具, 使用比较多的是以下几个,

> 其实要指定对应的构架, 这里用amd64代替, 

```python
from pwn import * 

# execve(path='/bin///sh', argv=['sh'], envp=0)
shellcraft.amd64.linux.sh() # getshell 

# open(file='flag', oflag=0, mode=0)
shellcraft.amd64.linux.open("flag")
# read(fd, buf, count)
shellcraft.amd64.linux.read(fd=0, buffer='rsp', count=8)
# write(fd, buf, count)
shellcraft.amd64.linux.write(fd=1, buffer='rsp', count=8)
```

# 对shellcode本身的限制

## 限制shellcode 可打印

可能存在 可打印, 不允许符号, 仅字母等几种情况,  这里我们不进行分类, 简单介绍几种处理手段, 

pwntools中内置一个加密shellcode的工具,  [pwntools encoders](https://docs.pwntools.com/en/stable/encoders.html),  但是这个工具使用起来,  效果比较一般, 另一个是[shellcode_encode](https://github.com/rcx/shellcode_encoder) , 可打印, 但是不能仅字母,  

推荐一下两个工具:

一个是[ae64](https://github.com/veritas501/ae64),  可以比较灵活的控制寄存器, 但是shellcode长度长一些,  另一个是[alpha3](https://github.com/SkyLined/alpha3),  这里建议直接使用[taqini师傅修改编译好的alpha3](https://github.com/TaQini/alpha3), 

使用:

```sh
python ./ALPHA3.py x64 ascii mixedcase rax --input="shellcode"
```

或者直接使用写好的脚本:

```bash
./shellcode_x64.sh rax
```

其中指定rax为shellcode基址, 然后同目录下的`shellcode`文件保存shellcode字节流, 

我们使用pwntools生成:

```bash
python sc.py > shellcode
```

脚本内:

```python
from pwn import * 
context.arch='amd64'
sc = shellcraft.sh() # 示例
print(asm(sc))
```

![image-20210825122252264](https://i.loli.net/2021/08/25/eoUfxcL231snjir.png)

## 限制shellcode长度

一般需要观察运行到shellcode时的, 尽量不做改动,

有一下两种思路: 

* 在限制内完成getshell, 需要比较精妙的构造, 
* 构造shellcode拓展, 再构造一次读取和跳转,

## 限制shellcode长度和可打印

一般这种需要手写shellcode, 使用工具生成的长度会不够

使用纯字符的汇编指令完成对shellcode的编写, 

可以参考

* [Alphanumeric shellcode](https://nets.ec/Alphanumeric_shellcode),   
* [x86字符编码表](https://web.archive.org/web/20110716082815/http://skypher.com/wiki/index.php?title=X86_alphanumeric_opcodes), 
* [x64_64字符编码表](https://web.archive.org/web/20110716082850/http://skypher.com/wiki/index.php?title=X64_alphanumeric_opcodes), 



# seccomp

开启c沙盒的情况,  shellcode绕过沙箱的整理, 

这里提一下seccomp的实现, 其实是内核层面过滤了对应的系统调用, 但是这个过滤指针对eax的值,  

## orw

最常见的情况,  不能getshell, 但我们ctf是为了读取flag, 因此可以使用open read write 函数进行利用,

大概分为两种情况, 

* 封了execve
* 只允许open read write 

第一种情况其实可以使用rop调用glibc中的open read write即可, 

```c
int open(char *filename);
int read(int fd, void *buf, size_t size);
int write(int fd, void *buf, size_t size);
```

这种其实使用简单的rop不用shellcode也可, 

但是因为glibc中的open并不是调用open的系统掉用, 因此第二种情况只能使用系统调用(syscall/int 80)完成,

这里参考系统调用表:

```c
// 64:
int rax  open(rax=2, rdi=*filename, rsi=flag, rdx=mod);
int rax  read(rax=0, rdi=fd, rsi=*buf, rdx=count);
int rax  open(rax=2, rdi=fd, rsi=*buf, rdx=count);

// 32:
int eax  open(eax=5, ebx=*filename, ecx=flag, edx=mod);
int eax  read(eax=3, ebx=fd, ecx=*buf, edx=count);
int eax  open(eax=4, ebx=fd, ecx=*buf, edx=count);
```

注意open的系统调用有三个参数, 有时候不成功就是因为参数没设置, 一般设置为0, 0, 即可, 

## orw不够

当题目没有提供完整的三个syscall的时候,  

因为seccomp其实是检查系统调用时的rax的值,  而64 32位的系统调用表不同, 因此我们可以切换到32位来获得到另一些系统调用,  有可能就补齐了三个函数

使用32位模式的方案有两种, 

* retfq函数切换到32位模式, 
* syscall_number |= X32_SYSCALL_BIT (0x40000000)

## 没有wirte

如果使用了32位模式仍然不能得到write函数的话, 

可以使用类似测信道的方式,  写入shellcode, 对读取进来的flag某一位检测, 使用`cmp`+`jz`的判断语句,  如果正确则死循环,  

然后通过pwntools进行爆破, 得到flag, 

## lseek系统调用

这里是另一个思路,  利用父子进程的操作, 

调用fork形成父子进程以后, 父进程再进行seccomp设置, 因此子进程不再沙盒内,  我们使用有限的系统调用向子进程内注入代码, 并利用子进程getshell, 

googlectf 2020:  onlywrtie 

# 其他

## 混合shellcode: x86-64 and arm64v8.

googlectf2021: ABC ARM AND AMD 

一段shellcode, 同时可以在arm64和x64下运行, 

# 相关题目

nuaa2020_pwn6



qwb2021_shellcode



googlectf2020 writeonly



midnightsunctf2019 gissa2



googlectf2021 ABC ARM AND AMD

