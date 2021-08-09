---
title: ucore_lab4
date: 2021-08-07 09:01:09
permalink: /pages/4069d3/
categories:
  - labbb
  - uCore
tags:
  - 
---
# ucore_lab4 

[[toc]]

## 理论

这一部分的理论就是线程和进程相关的操作, 这里主要着重内核态线程的实现,

其实也是比较老生常谈的话题了, 

具体实现思路其实就是将线程抽象为一个结构体,  以此将线程组织起来, 

然后建立合适的检测和线程切换机制, 

## 实验部分

首先就是实现线程结构体的初始化, 由于线程是指示控制流, 他本身其实不会独占储存空间等, 于是只需要给对应的上下文环境(可以简单理解为寄存器环境和对应的栈空间)即可, 由于要进行对于进程的控制, 增加对应的标识位(pid)\ 链表指针\ 运行标识位等等, 

初始化的时候, 基本都是简单的赋值为0即可, 

```c
static struct proc_struct *
alloc_proc(void) {
    struct proc_struct *proc = kmalloc(sizeof(struct proc_struct));
    if (proc != NULL) {
        proc->state = PROC_UNINIT;
        proc->pid = -1;
        proc->runs = 0;
        proc->kstack = NULL;
        proc->need_resched = 0;
        proc->parent = NULL;
        proc->mm = NULL;
//        proc->context = {0, 0, 0, 0, 0, 0, 0, 0};
        proc->tf = NULL;
        proc->cr3 = boot_cr3;
        proc->flags = 0;
        memset(&(proc->context), 0, sizeof(proc->context));
        memset(proc->name, 0, sizeof(proc->name));
    }
    return proc;
}

```

然后是`do_fork`函数,  这里是实际性的设置寄存器和堆空间, 然后将新建的线程加入到`hash_proc`和`proc_list`中,

```c
int
do_fork(uint32_t clone_flags, uintptr_t stack, struct trapframe *tf) {
    int ret = -E_NO_FREE_PROC;
    struct proc_struct *proc;
    if (nr_process >= MAX_PROCESS) {
        goto fork_out;
    }
    ret = -E_NO_MEM;

    proc = alloc_proc();
    if (setup_kstack(proc)){
        goto bad_fork_cleanup_proc;
    }
    if (copy_mm(clone_flags, proc)){
        goto bad_fork_cleanup_kstack;
    }
    copy_thread(proc, 0, tf);

    bool intr_flag;
    local_intr_save(intr_flag);
    {
        proc->pid = get_pid();
        proc->parent = current;
        hash_proc(proc);
        list_add(&proc_list, &(proc->list_link));
        nr_process++;
    }
    local_intr_restore(intr_flag);
    wakeup_proc(proc);
    ret = proc->pid;
fork_out:
    return ret;

bad_fork_cleanup_kstack:
    put_kstack(proc);
bad_fork_cleanup_proc:
    kfree(proc);
    goto fork_out;
}
```



## `proc_run`实现

这个问题其实是也在问, 线程切换具体的实现, 其实分为两种具体情况, 

### 被暂停的线程

在具体的切换实现之前, 我们先从被暂停的线程角度看,

> 在ucore中其实没有设置持续的运行, 只是运行一个init_main以后整个退出了 

ucore在运行时有一个全局变量`current`在运行, 在循环中检查`current->need_resched`, 这个标识指示是否要进行切换, 如果是, 则调用`schedule`函数进行线程切换, 

在`schedule`函数中, 遍历`proc_list`链表, 查找`proc->state`状态标识为`PROC_RUNABLE`(就绪态)的进程, 然后经过检测和运行次数标识位的增加, 进入`proc_run`函数, 

在`proc_run`函数中载入新的线程的信息,  esp和cr3两个寄存器的值, 然后进入`switch_to`函数, 参数为当前和下一个将运行的两个线程的context结构体,

`switch_to(&(prev->context), &(next->context))`, 这个函数进入switch_to函数, 这是一段汇编写的函数, 代码在`kern/process/switch.S`, 

根据函数调用规则, `switch_to`运行第一句的时候, 栈内结构如下:

```
---------------------------
| ret	(proc_run+100)
---------------------------
| arg1	(&prev->context)
---------------------------
| arg2	(&next->context)
---------------------------
```

于是我们从`esp+4`的位置取出arg1(&prev->context), 然后pop, 弹出返回地址复制到context中, 后续类似, 都是进行保存寄存器到`prev->context`的操作, 

> 接下来要拿到arg2, 原本是esp+8的位置, 但是刚pop出去了ret, 因此是esp+8-4 = esp+4, 

然后接下来,从`esp+4`位置取出arg2(&next->context), 然后向外赋值给寄存器, 也是新的线程上下文恢复, 最后使用`push+ret`的形式完成eip的赋值, 

### 切到暂停的线程运行

其实从上述代码中我们已经可以理解一个被暂停的线程如何恢复回来了, 

这里仔细提一下如果新的线程是之前被暂停的线程的话, 因为保存的时候保存的eip是switch_to函数的返回地址, 于是直接会回到proc_run函数内, 因为栈和寄存器会全部恢复, 接下来继续运行, 基本全是ret, 一步步回到被暂停转到`schedule`函数调用的位置, 

> 由于ucorelab4的位置还没实现完整的来回暂停切换的操作, 这一部分可以在lab5中更好的观察到, 

### 切换到新的线程运行

这里其实是我们lab4的重点, 

新建线程使用的是`kernel_thread`函数, 在这里会设置对应的tf结构体, tf结构体中其实也有一套保存寄存器的位置, 注意我们线程要运行的起始地址和参数被保存在了tf寄存器中的ebx和edx中, 而tf中的eip指向`kernel_thread_entry`函数, 然后context中的eip指向`forkret` , esp指向tf, 

当切换到新线程的时候, eip会运行到forkret位置, 此时栈内为tf结构体, 然后跳转到`__trapret`, 和中断异常处理一样, 从tf中恢复所有数据, 然后tf中会返回到`kernel_thread_entry`函数, 

这个函数直接压栈edx(参数压栈), 然后`call ebx`直接调用该线程的起始函数, 返回以后就是调用do_exit函数退出 
