---
title: gdb
date: 2021-02-21 22:15:08
permalink: /pages/931009/
categories:
  - tools
tags:
  -  gdb
---
# gdb使用 



## 单步执行

当只有汇编时, n和ni表示单步步过, s和si表示单步步入 ,

当存在源码时, n和s表示源码内, ni和si表示汇编层面,

## 设置命令行参数

`set args ...`, 

```sh
set args -V -f ./traces/amptjp-bal.rep # 设置命令行参数
```

## 设置宏 

然后使用gdb设置宏pr=x/20xg， 提高调试幸福感（雾

```sh
define pr
eval "x/20xg $arg0"
end
```

## 自动载入

- 主要使用gdb, 可以写gdb指令在一个文件，然后每次source进来， 当然也可以在当前目录写`.gdbinit`, 会每次自动source, 其中设置断点， 设置参数都可以了，

```bash
# ~/.gdbinit
set auto-load safe-path / # 取消安全路径，于是可以自动加载当前目录.gdbinit

# malloclab/.gdbinit
set args -V -f ./traces/amptjp-bal.rep # 设置命令行参数
#b mm.c:314
#b * mm_init
#b * mm_malloc
#b * mm_realloc
b * mm_free
#b * place
#b * coalesced
#b * extend_heap  # 断点， 
start # 自动开始运行， 注释以后自己手动start一下也可，
```

## 调用c语言函数

直接使用call可以调用c语言的函数，

### 任意地址写入修改

调试中修改地址， 可以使用set进行修改， 也可以借助调用c函数的特点，调用libc内的函数进行修改， 

基本使用`sscanf`和`write`以及本身的`set`都可以达到比较不错的体验

![](https://i.loli.net/2021/02/24/aRX3DUOcZjdFhiH.png)



