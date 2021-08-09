---
title: ucore_lab5
date: 2021-08-08 19:38:08
permalink: /pages/688253/
categories:
  - labbb
  - uCore
tags:
  - 
---
# ucore_lab5 

[[toc]]

## 思路

这个实验主要是编写用户级进程, 

首先从宏观上理解下拥有用户级别进程以后, 在os运行时的程序流, 

首先, cpu在同一个时期只能运行一个指令, 通过中断机制, 我们可以实现用户态跳到内核态, 从而使用内核的服务, 这里通过lab1中编写的终端初始化阶段的权限控制来设置用户态可以使用的中断服务, 只给了一个0x80(syscall系统调用服务), 

运行阶段os永远处于KERNBASE(0xc0000000)地址以上, 用户进程永远处于这个地址以下, 注意这里指的是虚拟地址, 也就是通过proc->mm中指示出来的已经被映射的地址,

因为os永远不变的停留在高地址, 我们这里讨论低地址下的用户进程, 由于用户进程是在变化的, 我们使用内核态的一个全局指针current来表示当前在运行的进程, 当前进程通过`current->mm`来实现对地址的规划, 确定可访问地址, 这一部分是lab3实现的, 而cpu内的指示一级页表地址的cr3寄存器也会被设置为`current->mm->pgdir`也就是当前进程的页表, 这样访问地址的时候就可以得到正确的本程序的地址, 而且进行进程切换的时候, 只需要简单的重新设置cr3寄存器即可完成低地址的进程数据的切换,

> 这个位置抽象出虚拟地址, 带来的好处妙不可言,
>
> 用户数据的低地址, 由cr3配合mm结构体进行控制, 切换时直接切换current和载入cr3寄存器, 就可以完成"低地址处程序数据的切换"的操作, 

关于进程切换, 其实和之前线程切换类似, 使用schedule和proc_run, 

然后之前程序没有实现的完整线程切换, 首先是在lab1的ticks时钟终端位置, 中断时会调用schedule函数, 然后在每次中断处理返回的时候会判断在用户态和`current->need_reched`标识, 判断是否进入schedule函数, 

## 细节

### 初始化

这里主要是程序执行的顺序, 

首先是一堆的初始化和check, 基本也都是和之前实验一致, 

`idt_init`要注意`T_SYSCALL`的权限控制, 

然后在`proc_init`函数中, 仍然是新建`idle`内核线程, 这个线程pid=0, 其实也是对应os本身, 然后新建`init_main`线程, 这个对应的是所有用户进程的父进程, 

然后`kern_init`函数继续运行,  到做后的`cpu_idle`函数, 调用`schedule`函数, 然后和之前我们lab4中一样, 程序通过`kernel_thread_entry`进入新线程, 

于是进入到`init_main`函数, 其实这个函数也挺简单, 仍然新建一个内核线程`user_main`, 然后调用`do_wait`等待这个线程退出, 

> `do_wait`函数会查看`current->cptr`也就是当前进程的子进程, 然后等待子进程运行结束, 

而`user_main`设置好参数进入`kernel_execve`函数, 这个函数直接使用系统调用转到syscall_execve函数, 然后转到do_execve函数, 

在`do_execve`函数中, 首先回收了`current->mm`, 即将原本的数据全部回收, 然后调用`load_icode`载入二进制文件和修改tf中的寄存器, 然后在程序回退到trap返回的iret时就会到对应的二进制文件中, 完成execve的操作, 

### 进程控制

这里主要跟一下几个进程控制的函数

#### do_fork

其实比较简单的一个函数, 他的作用就是设置一个新的进程/线程, 

几个需要注意的细节: 

首先是新的进程的parent(父进程指针)应该是current, 即当前进程, 

然后是设置对应的内核栈和复制父进程的虚拟地址和其中的内容, 

然后根据传入的参数`stack`和`tf`设置对应的esp和tf, 

然后设置对应的pid和增加到对应链表中, 

其中`set_link`函数,是设置proc结构体中的 `cptr`, `yptr`, `optr`, 因为子进程并不唯一, 这个函数位置保证, 父进程的`cptr`指针指向最近建立的子进程, `yptr`和`optr`是子进程之间通过时间顺序形成的双向链表, 

> 当然, 这个链表不是环状的, 两侧都是NULL

调用do_fork的位置有两个, 

* kernel_thread

这种情况下就是新建线程, 和我们lab4中分析的差不多, 设置好数据以后通过iret跳到`kernel_thread_entry`函数, 然后调用, 

这一套流程就是靠调用do_fork时设置好的tf实现的, 

* syscall_fork

这种一般是程序通过系统调用走过来的, 这时候我们需要和原本一模一样的两个进程, 因此这时候do_fork和窜入的tf和esp都是和原程序一致的.

#### do_execve 

先进行一个清空原本进程数据的操作, 就是销毁了`current->mm`结构体, 

然后调用`load_icode`, 

此函数中, 解析对应的elf文件, 装载到内存并且设置对应权限, 这时候也一并设置好了新的`current->mm`结构体, 而且已经是新的程序的了, 然后设置tf结构体, 特别注意的是相关段寄存器使用用户态, 然后eip为`elf->entry`, 

最后设置好进程名, 返回, 一直到中断返回的时候iret会使用`tf`结构体返回到对应的程序入口位置, 

#### do_exit

这个好像没啥好说的, 就是销毁`current->mm`, 

设置当前进程的状态为等待父进程回收(`PROC_ZOMBIE`), 

然后如果是有父进程且父进程处于等待子进程返回的状态, 则激活父进程,  

此程序推出, 查看是否有子进程, 如果存在子进程则将子进程扔给`initproc`, 作为`initproc`的子进程, 

然后进入进程调度, 选择一个进程去运行, 当返回到父进程的时候, 父进程应该是在`do_wait`中, 于是也就进行了进程结构体的回收, 因此一个进程也正式结束.

#### do_wait 

首先检查参数二的地址是否正确, 

然后检查如果pid对应的进程存在且为当前进程的子进程, 如果pid为0, 则以此通过cptr yptr optr遍历所以子进程,  

以上两种情况都会判断子进程是否在等待被回收(`proc->state==PROC_ZOMBIE`), 如果存在则会到found位置, 回收进程结构体等数据, 

如果存在子进程, 且子进程都不是等待回收, 则设置当前进程为等待子进程结束状态, 然后进入进程调度, 然后再跳回查找的位置, 重复以上流程,

#### do_kill

设置对应进程的state位置为`PF_EXITING`, 

很多位置都有对此的检测, 最稳妥的一个是中断返回的位置, 直接执行do_exit函数,

## 实现 

### 对之前实验的修改

```c
void
idt_init(void) {
     extern uintptr_t __vectors[];
     for(int i=0; i<256; i++){
         if (i == T_SYSCALL) {
             SETGATE(idt[i], 0, GD_KTEXT, __vectors[i], DPL_USER);
         }else{
             SETGATE(idt[i], 0, GD_KTEXT, __vectors[i], DPL_KERNEL);
         }
     }
     lidt(&idt_pd);
}
```



```c
static struct proc_struct *
alloc_proc(void) {
    struct proc_struct *proc = kmalloc(sizeof(struct proc_struct));
    if (proc != NULL) {
        proc->pid = -1;
        proc->state = PROC_UNINIT;
        proc->runs = 0;
        proc->kstack = NULL;
        proc->need_resched = 0;
        proc->parent = NULL;
        proc->mm = NULL;
        memset(&(proc->context), 0, sizeof(proc->context));
        proc->tf = NULL;
        proc->cr3 = boot_cr3;
        proc->flags = 0;
        memset(&(proc->name), 0, sizeof(proc->name));

        proc->wait_state = 0;
        proc->cptr = proc->optr = proc->yptr = NULL;
    }
    return proc;
}
```



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
   proc->parent = current;
    assert(current->wait_state == 0);
    if (setup_kstack(proc)){
        goto bad_fork_cleanup_proc;
    }

    if (copy_mm(clone_flags, proc)){
        goto bad_fork_cleanup_kstack;
    }

    copy_thread(proc, stack, tf);

    bool intr_flag;
    local_intr_save(intr_flag);
    {
        proc->pid = get_pid();
        hash_proc(proc);
        set_links(proc);
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

### 加载程序

```c
static int
load_icode(unsigned char *binary, size_t size) {
    if (current->mm != NULL) {
        panic("load_icode: current->mm must be empty.\n");
    }

    int ret = -E_NO_MEM;
    struct mm_struct *mm;
    //(1) create a new mm for current process
    if ((mm = mm_create()) == NULL) {
        goto bad_mm;
    }
    //(2) create a new PDT, and mm->pgdir= kernel virtual addr of PDT
    if (setup_pgdir(mm) != 0) {
        goto bad_pgdir_cleanup_mm;
    }
    //(3) copy TEXT/DATA section, build BSS parts in binary to memory space of process
    struct Page *page;
    //(3.1) get the file header of the bianry program (ELF format)
    struct elfhdr *elf = (struct elfhdr *)binary;
    //(3.2) get the entry of the program section headers of the bianry program (ELF format)
    struct proghdr *ph = (struct proghdr *)(binary + elf->e_phoff);
    //(3.3) This program is valid?
    if (elf->e_magic != ELF_MAGIC) {
        ret = -E_INVAL_ELF;
        goto bad_elf_cleanup_pgdir;
    }

    uint32_t vm_flags, perm;
    struct proghdr *ph_end = ph + elf->e_phnum;
    for (; ph < ph_end; ph ++) {
    //(3.4) find every program section headers
        if (ph->p_type != ELF_PT_LOAD) {
            continue ;
        }
        if (ph->p_filesz > ph->p_memsz) {
            ret = -E_INVAL_ELF;
            goto bad_cleanup_mmap;
        }
        if (ph->p_filesz == 0) {
            continue ;
        }
    //(3.5) call mm_map fun to setup the new vma ( ph->p_va, ph->p_memsz)
        vm_flags = 0, perm = PTE_U;
        if (ph->p_flags & ELF_PF_X) vm_flags |= VM_EXEC;
        if (ph->p_flags & ELF_PF_W) vm_flags |= VM_WRITE;
        if (ph->p_flags & ELF_PF_R) vm_flags |= VM_READ;
        if (vm_flags & VM_WRITE) perm |= PTE_W;
        if ((ret = mm_map(mm, ph->p_va, ph->p_memsz, vm_flags, NULL)) != 0) {
            goto bad_cleanup_mmap;
        }
        unsigned char *from = binary + ph->p_offset;
        size_t off, size;
        uintptr_t start = ph->p_va, end, la = ROUNDDOWN(start, PGSIZE);

        ret = -E_NO_MEM;

     //(3.6) alloc memory, and  copy the contents of every program section (from, from+end) to process's memory (la, la+end)
        end = ph->p_va + ph->p_filesz;
     //(3.6.1) copy TEXT/DATA section of bianry program
        while (start < end) {
            if ((page = pgdir_alloc_page(mm->pgdir, la, perm)) == NULL) {
                goto bad_cleanup_mmap;
            }
            off = start - la, size = PGSIZE - off, la += PGSIZE;
            if (end < la) {
                size -= la - end;
            }
            memcpy(page2kva(page) + off, from, size);
            start += size, from += size;
        }

      //(3.6.2) build BSS section of binary program
        end = ph->p_va + ph->p_memsz;
        if (start < la) {
            /* ph->p_memsz == ph->p_filesz */
            if (start == end) {
                continue ;
            }
            off = start + PGSIZE - la, size = PGSIZE - off;
            if (end < la) {
                size -= la - end;
            }
            memset(page2kva(page) + off, 0, size);
            start += size;
            assert((end < la && start == end) || (end >= la && start == la));
        }
        while (start < end) {
            if ((page = pgdir_alloc_page(mm->pgdir, la, perm)) == NULL) {
                goto bad_cleanup_mmap;
            }
            off = start - la, size = PGSIZE - off, la += PGSIZE;
            if (end < la) {
                size -= la - end;
            }
            memset(page2kva(page) + off, 0, size);
            start += size;
        }
    }
    //(4) build user stack memory
    vm_flags = VM_READ | VM_WRITE | VM_STACK;
    if ((ret = mm_map(mm, USTACKTOP - USTACKSIZE, USTACKSIZE, vm_flags, NULL)) != 0) {
        goto bad_cleanup_mmap;
    }
    assert(pgdir_alloc_page(mm->pgdir, USTACKTOP-PGSIZE , PTE_USER) != NULL);
    assert(pgdir_alloc_page(mm->pgdir, USTACKTOP-2*PGSIZE , PTE_USER) != NULL);
    assert(pgdir_alloc_page(mm->pgdir, USTACKTOP-3*PGSIZE , PTE_USER) != NULL);
    assert(pgdir_alloc_page(mm->pgdir, USTACKTOP-4*PGSIZE , PTE_USER) != NULL);
    
    //(5) set current process's mm, sr3, and set CR3 reg = physical addr of Page Directory
    mm_count_inc(mm);
    current->mm = mm;
    current->cr3 = PADDR(mm->pgdir);
    lcr3(PADDR(mm->pgdir));

    //(6) setup trapframe for user environment
    struct trapframe *tf = current->tf;
    memset(tf, 0, sizeof(struct trapframe));

    tf->tf_cs = USER_CS;
    tf->tf_ds = tf->tf_es = tf->tf_ss = USER_DS;
    tf->tf_esp = USTACKTOP;
    tf->tf_eip = elf->e_entry;
    tf->tf_eflags = FL_IF;

    ret = 0;
out:
    return ret;
bad_cleanup_mmap:
    exit_mmap(mm);
bad_elf_cleanup_pgdir:
    put_pgdir(mm);
bad_pgdir_cleanup_mm:
    mm_destroy(mm);
bad_mm:
    goto out;
}
```



### 内存复制

```c
int
copy_range(pde_t *to, pde_t *from, uintptr_t start, uintptr_t end, bool share) {
    assert(start % PGSIZE == 0 && end % PGSIZE == 0);
    assert(USER_ACCESS(start, end));
    // copy content by page unit.
    do {
        //call get_pte to find process A's pte according to the addr start
        pte_t *ptep = get_pte(from, start, 0), *nptep;
        if (ptep == NULL) {
            start = ROUNDDOWN(start + PTSIZE, PTSIZE);
            continue ;
        }
        //call get_pte to find process B's pte according to the addr start. If pte is NULL, just alloc a PT
        if (*ptep & PTE_P) {
            if ((nptep = get_pte(to, start, 1)) == NULL) {
                return -E_NO_MEM;
            }
        uint32_t perm = (*ptep & PTE_USER);
        //get page from ptep
        struct Page *page = pte2page(*ptep);
        // alloc a page for process B
        struct Page *npage=alloc_page();
        assert(page!=NULL);
        assert(npage!=NULL);
        int ret=0;

        void * src_kvaddr = page2kva(page);
        void * dst_kvaddr = page2kva(npage);
        memcpy(dst_kvaddr, src_kvaddr, PGSIZE);
        ret = page_insert(to, npage, start, perm);
        assert(ret == 0);
        }
        start += PGSIZE;
    } while (start != 0 && start < end);
    return 0;
}
```

