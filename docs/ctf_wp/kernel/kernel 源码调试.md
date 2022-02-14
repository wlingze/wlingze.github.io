---
title: kernel 源码调试
date: 2022-02-13 21:17:58
permalink: /pages/6bb913/
categories:
  - ctf_wp
  - kernel
tags:
  - 
---
## kernel源码调试

[[toc]]

## 编译

这里用了 [kernelall](https://github.com/PIG-007/kernelAll)这个项目。可以拉个docker直接跑，我在pd的vm中有些问题，但是docker完全没问题。

## gdb scrips 

可以在编译的时候修改编译选项， 设置产生gdb脚本，或者直接自己手动设置:

```sh
ln -fsn scripts/gdb/vmlinux-gdb.py
```

同目录下会出现对应的vmlinux-gdb.py文件， 使用gdb ./vmlinux会自动载入这个脚本，可能会提示设置`safe-path`， 直接按提示进行设置即可。

然后使用 target remote :1234 即可连接到kernel调试，并且载入的这个python文件会设置好源码等，

> 

![image-20220214222933894](https://s2.loli.net/2022/02/14/9QwlgeCTjBz3Kfc.png)



### gef

我们上述的方案可以看到gef运行良好，而且vmmap进行查看也是现实qemu内的vmlinux， 

在没有源码或者没有vmlinux-gdb.py的时候建议使用`gef-remote --qemu-mode localhost:1234`，

但是gef这个工具关于register和stack的显示应该是通过`/proc/<pid>/`实现的，因此使用`get-remote --qemu-mode`的时候经常会出现尝试读取`/proc/1/mem`的情况，给sudo权限即可，他读取和显示的其实是qemu内的，也不太用担心。但是如果vmmap一下就会发现这个`/proc/1/mem`确实是本机的。这可能是gef在qemu调试上的问题。

