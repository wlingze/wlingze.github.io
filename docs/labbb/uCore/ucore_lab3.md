---
title: ucore_lab3
date: 2021-08-04 15:36:03
permalink: /pages/082752/
categories:
  - labbb
  - uCore
tags:
  - 
---
# ucore_lab3 

[[toc]]

## 理论知识 

这一部分主要想实现的是虚拟内存管理部分, 

从之前的段页机制实现以后, 我们现在可以实现线性地址到物理地址的映射, 并且可以实现线性地址连续但是物理地址不连续的映射关系, 其实也是将两者分离开来.

但是仅仅实现段页机制以后, 程序访问地址仍然受到物理地址大小(内存大小)的制约, 这一部分的虚拟内存管理,  其实是实现物理地址大小一定的情况下, 线性地址可以虚拟出来更大.

主要的思路是利用外存, 在使用逻辑地址时我们通过段页机制映射到内存中进行访问, 而现在, 使用内存和外存同时储存这些数据, 但是物理地址只能访问内存中的, 于是修改原本查表式的逻辑地址-物理地址的映射关系, 增加一个是否在内存中的标识位, 通过这个标识位进行判断, 是否需要在内存和外存中交换数据. 

访问对应逻辑地址时, 同原来一样进行查表, 但是会检查对应的页是否在内存中, 如果在外存中则需要换进内存中, 然后再次进行同样的操作, 

![image](https://chyyuu.gitbooks.io/ucore_os_docs/content/lab3_figs/image001.png)

> 这个访问的检测是靠中断实现, 
>
> 直接访问某个地址, 会出现确页异常中断, 再去处理, 然后重新执行报错语句.

主要重点应该是页替换算法. 

### ucore实现细节

这里写一下ucore实现中比较有意思的细节, 其实主要是`vma_struct`和`mm_struct`两个结构体, 

`vma_struct`主要指定了一片连续的虚拟内存空间, 并且指定了他们的起始结束地址和权限信息, 

而`mm_struct`指定了好几个`vma_struct`结构体, 并指定一个pgdir一级页表项, 

其实这两个是在模拟一个应用程序在运行的状态, 有自己的几个权限不同的虚拟内存段, 

而且ucore并不会直接建立建立一个映射关系, 只有访问到对应内存的时候发生缺页异常, ucore接手才会进行一次映射关系的建立,或分配新的物理地址或从外存中替换回来.

> 还有一点是, 操作系统建立段页机制以后, cpu访问对应地址的时候会自动完成一个转化操作, 也就是我们建立映射以后某个虚拟地址就可以正常访问的到, 因为cpu内操作无法捕捉这个位置可能造成一定疑惑, 

## 实验部分 

### 练习1

映射物理地址页, 

所有的逻辑地址现在都不会立刻映射到物理地址上, 访问时产生异常, 然后调用`do_pdfault`函数进行对应的地址映射, 在这个函数中, 首先进行检查判断这个逻辑地址是我们通过`vma_struct`和`mm_struct`结构体设置过的,

然后尝试获取对应线性地址的pte, 如果查找不到则立刻增加一个物理页并建立映射关系`pgdir_alloc_page`, 如果可以检查到pte, 也就是这个映射关系被建立过了, 现在仍然出现缺页异常, 那么一定是因为对应的页不再内存中, 我们调用对应的页替换的函数, 将对应页换出, 建立对应物理地址映射关系.

```c
    if ((ptep = get_pte(mm->pgdir, addr, 1)) == NULL){
        cprintf("do_pgfault failed: get_pte failed\n");
        goto failed;
    }

    if(*ptep == 0){
        if (pgdir_alloc_page(mm->pgdir, addr, perm) == 0){
            cprintf("do_pgfault failed: alloc page failed\n");
            goto failed;
        }
    } else {
        if(swap_init_ok) {
            struct Page * page = NULL;
            swap_in(mm, addr, &page);
            page_insert(mm->pgdir, page, addr, perm);
            swap_map_swappable(mm, addr, page, 1);
            page->pra_vaddr = addr;
        }
        else {
            cprintf("no swap_init_ok but ptep is %x, failed\n",*ptep);
            goto failed;
        }
    }
    ret = 0;
```

### 练习2

增加对应的fifo页替换算法的函数, 代码实现其实已经差不多了, 

就是新增的加到开头, 取出的时候从结尾取出,

```c
static int
_fifo_map_swappable(struct mm_struct *mm, uintptr_t addr, struct Page *page, int swap_in)
{
    list_entry_t *head=(list_entry_t*) mm->sm_priv;
    list_entry_t *entry=&(page->pra_page_link);
 
    assert(entry != NULL && head != NULL);
    
    list_entry_t *le;
    struct Page * tmp;
    le = head;
    while ((le = list_next(le)) != head){
        tmp = le2page(le, pra_page_link);
        if (tmp == page){
            list_del(le);
        }
    }
    list_add(head, entry);
    return 0;
}

static int
_fifo_swap_out_victim(struct mm_struct *mm, struct Page ** ptr_page, int in_tick)
{
     list_entry_t *head=(list_entry_t*) mm->sm_priv;
         assert(head != NULL);
     assert(in_tick==0);

     list_entry_t  *le = list_prev(head);
     assert(le != head);
     struct Page * p = le2page(le, pra_page_link);
    list_del(le);
     assert(p != NULL);
     *ptr_page = p;
     return 0;
}
```



