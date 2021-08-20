---
title: ucore_lab6
date: 2021-08-19 16:21:03
permalink: /pages/13f498/
categories:
  - labbb
  - uCore
tags:
  - 
---
# ucore_lab6

[[toc]]

## 处理机调度

### 概念

**cpu资源的分时复用**

进程切换: cpu资源当前占用者的切换:

- 保存当前进程在pcb的执行上下文,
- 恢复下一个进程的执行上下文,

**处理机调度:**

从就绪队列挑选下一个占用cpu的进程

从多个cpu挑选就绪进程可用的cpu(多cpu的情况下)

**调度程序**

挑选可用进程的内核函数, 

**调度时机:**

从什么时候开始进行调度? 

最基本的: 进程三状态模型, 等待\退出进行调度, 

> 这里对应"非抢占系统", 当前进程主动放弃cpu时才会进行调度, os不会主动切换到其他进程, 

可抢占系统:

中断请求完成, 进行检测是否进行调度, 

> 一般会配合时间片等结构, 每次时钟中断设置时间片衰减, 用完则调整为可被抢占状态, 然后中断返回时进行调度,

## 调度算法

### 非抢占系统

#### 先来先服务 FCFS

按照到达就绪队列的顺序来排序, 进程主动让出cpu, 然后就绪队列下一个进程占用cpu, 

周转时间和到达时间有关, 

好处: 简单, 

缺点: 平均等待时间波动较大, io资源和cpu资源利用效率低, 

#### 短进程优先

选择预期执行时间进行排序, 

* SPN 短进程优先

* SJF 短作业先服务
* SRT 短剩余时间优先

好处: 最优的周转时间

缺点: 导致长进程饥饿, 需要估计执行时间,

#### 高相应比优先 

依据等待时间进行排序, 

R = (w + s) / s, w: 等待时间, s:执行时间,

可以避免短进程优先算法的饥饿, 可以避免进程饿死, 

### 抢占系统

#### 时间片轮转

RR: round robin

最长只能使用一个时间片长度, 然后就要让出cpu使用权,

要约定时间片, 时间片结束或者进程让出cpu, 按照FCFS算法选择下个进程,

开销: 额外的上下文切换, 

时间片的设置: 

* 时间片太短: 反应迅速, 但是产生大量的上下文切换, 影响系统吞吐量.
* 时间片太长: 等待时间太长, 退化成FCFS算法, 

经验: 10毫秒, 上下文切换占cpu %1, 

#### 多级队列

MFQ, 

就绪队列分为多个子队列, 

不同队列可以使用不同调度算法, 

进程可以在多个子队列之间进行调整, 

* **多级反馈队列**

进程可以在不同队列之间移动, 

时间片大小随优先级级别增加而增加, 

进程在当前的时间片之内没有完成, 则降到下一个优先级, 

#### 公平共享

FSS, 

按照进程占用的资源进行分配, 

用户和进程分组, 

## 代码部分 

在课程中理论部分讲的非常明确了, 

实际代码填补一下stride scheduling算法即可, 

计时器和rr是一样的, 使用时间片的抢占方案, 

```c
static void
stride_proc_tick(struct run_queue *rq, struct proc_struct *proc) {
     /* LAB6: YOUR CODE */
     if(proc->time_slice > 0){
         proc->time_slice --;
     }
     if(proc->time_slice == 0){
         proc->need_resched = 1;
     }
}
```

进入列表, 删除, 取出下一个使用斜堆结构, 

注意步长的设置, 我这里选择是取出的时候增长对应步长, 

```c
stride_enqueue(struct run_queue *rq, struct proc_struct *proc) {
    rq->lab6_run_pool = skew_heap_insert(rq->lab6_run_pool, &(proc->lab6_run_pool), proc_stride_comp_f);
    if (proc->time_slice == 0 || proc->time_slice > rq->max_time_slice){
        proc->time_slice = rq->max_time_slice;
    }
    proc->rq = rq;
    rq->proc_num++;
}

static void
stride_dequeue(struct run_queue *rq, struct proc_struct *proc) {
    rq->lab6_run_pool = skew_heap_remove(rq->lab6_run_pool, &(proc->lab6_run_pool), proc_stride_comp_f);
    proc->lab6_stride += BIG_STRIDE / proc->lab6_priority;
     rq->proc_num --;
}

static struct proc_struct *
stride_pick_next(struct run_queue *rq) {
    skew_heap_entry_t *le = rq->lab6_run_pool;
     if (le != NULL){
         struct proc_struct * p = le2proc(le, lab6_run_pool);
         return p;
     }
     return NULL;
}
```

