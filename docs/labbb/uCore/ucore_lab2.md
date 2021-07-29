---
title: ucore_lab2
date: 2021-07-29
permalink: /pages/ac25ef/
categories:
  - labbb
  - uCore
tags:
  - 
---

# lab2 - physical memory

[[toc]]

## 基础知识

这个实验主要是学习对于物理内存的使用, 或者说管理物理内存, 

### 简述

主要分为两个部分, 连续内存分配和非连续内存分配,

首先对于一片平坦的物理内存的直接操作手段, 其实和csapp中实现过的malloclab类似, 就是对于空闲空间的链表和查找机制(frist_fit/bast_fit/worst_fit/buddy_system), 配合对应的合并切割内存代码实现即可, 

其次, 对于os来说, 物理内存大小是固定的,如果只是简单建立一个对等映射, 多个应用程序需要的虚拟内存肯定是不足的, 应用程序也可以访问内核级别数据造成危险等许多问题, 

于是在物理地址和虚拟地址之间要加一层虚拟层, 

这里引入了非连续内存分配,其实就是划分一个个块, 通过查表的形式建立映射关系, 这样查表之前可能连续的几个块, 在查表以后(理论上应该)可以随意摆放. 

按照划分块的大小有分段和分页两类管理方式, 

分段管理主要是一大块内存空间, 这种方案可以方便的控制权限, 分离开用户级别和内核级别, 

分页是管理是主要实现映射的部分, 内存划分比较小, 需要的时候进行映射,

----

从应用程序向下看, 程序使用的是虚拟地址, 

在操作系统层面会首先使用段机制, 其实硬件方面也有支持, 即cs\gs\fs\ss\es等寄存器, 这主要可以实现权限划分, 虚拟地址会通过段机制转化为线性地址, 

得到线性地址以后进行页机制的查表, 得到物理地址, 这里一般会是一个二级页表机制, 

> 在ucore lab2中的段机制其实是一个对等映射.

### 连续地址分配

首先要对于物理内存进行一定的管理, 

这里是双向链表+bast_fit, 实现起来还比较简单,

代码已经写的差不多了, 在插入链表的位置没有按顺序, 写了个按顺序插入链表的函数

```c
static void 
free_list_add(struct Page * page){
    list_entry_t *le = &free_list;
    struct Page *tmp;
    while ((le=list_next(le)) != &free_list) {
        tmp = le2page(le, page_link);
        if (tmp->property >= page->property){
            break;
        }
    }
    list_add_before(le, &(page->page_link));
}
```

### 非连续地址分配

其实这里是个理论性的问题, 分清楚储存和使用的是物理地址 线性地址 虚拟地址 page就好了.

`get_pte`函数返回的是pte标中索引出的地址, 这点分析下`get_page`和`page_insert`能看出来, 返回值的写法的话可以参考`check_pgdir`函数14行. 

而且也是`check_pgdir`函数的同样位置, 可以看出来`pde`中储存的是pte表的物理地址, 

`KADDR`返回的是虚拟地址, memset函数使用的是虚拟地址, 

设置对应权限在注释里写的挺全, 大概就ok了 

```c
pte_t *
get_pte(pde_t *pgdir, uintptr_t la, bool create) {
    pde_t *pde = pgdir[PDX(la)];
    if (pde == NULL){
        if (!create) {
            return NULL;
        }

        struct Page * page = alloc_page();
        set_page_ref(page, 1);
        
        pte_t pte = page2pa(page) | PTE_U | PTE_W | PTE_P;
        memset(KADDR(pte), 0, PGSIZE);

        pgdir[PDX(la)] = pte;
    }
    return &((pte_t *)KADDR(PDE_ADDR(pgdir[PDX(la)])))[PTX(la)];

}


static inline void
page_remove_pte(pde_t *pgdir, uintptr_t la, pte_t *ptep) {
    if (*ptep & PTE_P){
        struct Page *page = pte2page(*ptep);
        if (page_ref_dec(page) == 0){
            free_page(page);
        }
        *ptep = NULL;
        tlb_invalidate(pgdir, la);
    }

```

