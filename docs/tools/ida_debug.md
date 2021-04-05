---
title: ida_debug
date: 2021-04-05 20:21:12
permalink: /pages/2206d6/
categories:
  - tools
tags:
  - 
---
# ida调试技巧

[[toc]]

参考：[ida调试器概述](https://www.hex-rays.com/products/ida/debugger/#details)

## 常规调试

win或linux下x86的文件，一般使用ida远程动态调试，

> 其实ida支持本地调试，但是以前的ida7.0泄漏版本存在bug，这个功能会直接导致ida崩溃，新的7.5泄漏版本不清楚，而且我一直是在wine下运行，就一直使用远程调试。

### ida server

这里其实比较简单，首先保证获取远程机器的ip, 并且可以检查下是否可以ping通。

>  一般本地运行的可以127.0.0.1
>
> 远程ip： linux下使用`ifconfig`指令，win下使用`ipconfig`指令

然后将对应的文件在对应机器运行即可，会自动监听默认端口， 

> ida目前支持的这种调试方式， 即在`$ida_dir/dbgsrv`目录下对应文件
>
> Intel构架： windows linux macos， 32位 64位，
>
> 安卓： arm 32位/64位，intel 32/64, 
>
> armlinux: 32位，

![](https://i.loli.net/2021/04/05/rXAFiQxDgaleOU8.png)

### ida启动调试

首先在下拉菜单选择remote ... debug，然后点击启动，设置ip和端口即可，

> 我这里是本地linux运行的server，于是是`127.0.0.1`， 

![](https://i.loli.net/2021/04/05/IOSAzpQ2YLh6o9i.png)


## 特殊：gdb server

ida可以使用gdb的server, 

![](https://i.loli.net/2021/04/05/OxsNn2dTSHjmBkW.png)

于是可以通过vmware进行linux或windows的内核调试，或通过qemu实现特殊构架的文件的调试，

这里展示一种通过qemu进行调试的方案：

### 启动一个gdb server

一般的文件可以通过`gdbserver`来启动，`qemu`通过`-g 端口`来开启一个gdbserver, 

然后这时候其实可以使用gdb进行远程调试，但是这里我们使用ida,

### 在ida中设置

首先选择`remote gdb debugger`， 

![](https://i.loli.net/2021/04/05/PirkAqB6HcMERzY.png)

然后启动对应的server, 点击运行或者快捷键f9, 设置ip和端口号进入调试状态，

### 断点的设置

这种运行方式，一般来说直接在文件下好断点以后，ida调试状态的地址和文件的地址不会进行映射，我们其实是无法下断点的，

但是这种调试状态下地址不会变， 我们找到调试状态下的main函数，然后下一次断点即可，

而且这种gdbserver, 一般开始运行以后，会直接在ld的入口部分停下，然后等待调试器连接，这是一种开始运行的调试，并不是附加调试，即，我们每次开始进入调试的时候其实是在ld文件开始运行的时候，于是慢慢找到main函数位置，然后就是普通的调试状态了，

### 手动设置信息

如果是非常规的cpu构架，载入文件的话ida会识别出来，并设置好debug状态的构架，

如果没有载入文件的话，则要进行手动设置，主要就是设置对应的cpu架构：

![](https://i.loli.net/2021/04/05/pezKVTsQwuvMaRJ.png)



另一个点是ida本身对于调试时可访问的内存有一个默认范围，

使用[gdbserver的时候却不会在意到这个范围](https://www.hex-rays.com/products/ida/support/idadoc/1697.shtml)，可能存在程序在访问某个地址而ida调试器不能访问这个内存的问题， 这里可能需要手动调整这个访问内存的范围：

![](https://i.loli.net/2021/04/05/oBWYHVJv4tOMlI8.png)

## 调试技巧

ida调试器使用， f2：下断点，f7：单步步入， f8：单步步过，f9：执行/开始执行，

然后对于某些在main函数之前进行检查的反调试，可以使用attach来过掉，

## idapython 辅助调试

这一部分在idapython中写了。

 