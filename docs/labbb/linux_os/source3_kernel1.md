---
title: source3_kernel
date: 2021-01-26 19:21:23
permalink: /pages/a05c8d/
categories:
  - labbb
  - linux_os
tags:

---
# linux source code analysis 3
# kernel part 1

the kernel directory contains 3 folders, 10 c language files, 2 assembly files. 

in the kernel part, we only analyze a few files here, ant the contents of the 3 folders are in the subsections of the kernel 

Here is a brief introduction to their functions. 

# file 

> for individual files 
>

they can be divided into three categories in terms of functions. 

![call relationship](https://i.loli.net/2021/01/26/PUYnw6a932DGikh.png)

## interrupt handling 

`asm.s` and `traps.c` 

---

the assembly language processing process of interrupts caused by most hardware exceptions is defined in asm.

int traps, the c functions needed in asm.s interrupt processing in implemented, and the `trap_init` function is provided, whict is called in `init/main.c` to perform initialization operations.

the interrupt defined here is generally an abnormal interrupt caused by the hardware part, mainly reserved for interrupt int0 -- int16

regardign whether the interrupt has an error code, `asm.s` will divide them into two categories for execution, but the processing flow is still the same.

> the abnormal interrupt that generated the error code 
> int 8, int 10 -- int 14

**p1** processing flow of interrupt caused by hardware exceptions.
![p1](https://i.loli.net/2021/01/26/ibPmtyg2NGnAXR1.png)

**p2** stack changes in hardware error handling .
![p2](https://i.loli.net/2021/01/27/a6jcRZV8fvFYGyu.png)

## system call 


`system_call.s` and `fork.c` \ `sys.c `\ `exit.c` \ `signal.c` 


---

the only way for a program in linux to call the kernel is to use a  **system call** .

> which is triggered by int 0x80 interrupt, 
>
> **eax**  stores the **call number**, indicating the function to be called 
>
>
> if there are **parameters** , pass it, **ebx, ecx, edx,**
> the order of storing the call parameters, and take up to 3 parameters.
>

-----

`system_call.s` writes the entry positon of the system call, which is similar to the function of `asm.s` in the hardware exceptioin interrupt handling part, which also handles clock interrupts, hard disk and floppy disk interrupts. 

fork.c and signal.c provide the necessary c processing functions for system calls, and it also implements a few sys_xx system call function, sys.c and exit.c mainly implement some other sys_xx system call functions. 

These sys_xx functions are functions that are transferred to the call after entering the corresponding system call. Some are implement in C language, and some are implemented in assembly.

All implementation functions of all system alls are arranged into a function pointer table according to the call number. 

> `include/linux/sys.h`, `sys_call_table[]`, 

Enter the system call processing function, first compare whether eax is valid, (within a certain range, the number is stored in `nr_system_calls`).

Use `call *sys_call_table(, %eax, 4)` in `system_call.s` to trancfer to the corresponding function.

---

After the corresponding function returns, puth the ruturn value onto the stack, check the program status and the corresponding time slice, choose whether to jump to the `schedule()` function, and return to the `ret_from_sys_call`, prosition after the call is over.

```assembly
reschedule:
    pushl $ret_from_sys_call
    jmp schedule 
```

`ret_from_sys_call` performs the processing work after the system call, mainly to determine whether the current process initialization process 0 or whether it is a kernel process. in both cases, the stack content will be directly poped up and exited. Finally, the signal of the process calling the system call is checked, if any the received signal will be handled by `do_signal()`.

Finally restore the register and return to the calling program.

---

System call location for register processing.

After entering the system call position, after checking the system call number, all the registers are pushed onto the stack, and the corresponding global variable is set to indicate the offset of the corresponding register, and then cs is obtained in the form of `CS(%esp)` the value of the cs segment register.


For the implementation details of contrast permissions.

The kernel expresses the authority through the low 2 bits of the cs segment register, which can represent theree kinds of permissions of 0\1\2, called RPL.

Here compare whether it is a system call issued by the kernel layer, directly compare the caller's CS segment register and 0xf to determine whether the low bit is 3 (0b11), that is, whether RPL=3 (user layer).

---

Then we pay attention to the two system call functions defined in `system_call.s`.

`sys_exec` function, take the eip pointer of the caller function as a parameter to call `do_execve()` 

> `fs/exe.c` `do_execve()`

`sys_fork` function, used to create a child process, first call function `find_empty_process()` to obtain a process number, (if it a negative number, the current task array is full, then exit directly), and then call function `copy_process()` to copy the process.

---

**p4** system interrupt call processing flow
![p4](https://i.loli.net/2021/01/28/kt1ZPRgDbjXrMUh.png)


## process scheduling

`schedule.c` , `mktime.c` ,  `panic.c`  and `printk.c` \ `vsprintf.c`

The `schedule.c` program includes the `schedule()` \ `sleep_on()` \ `wake_up()` function that the kernel calls the most frequently. 
This is the kernel's core scheduler, which is used to switch processes or change the state of execution.

`mktime.c` contains a time function used by the kernel, which is only called once in `init/main.c`. 

the `panic.c` program only contains a panic function, which is used to display an error and stop when the kernel has an error.

`printk.c` and `vsprintf.c` are used to display kernel information, and implement the kernel-specific print function `printk()`, and the fromatted string output function `vsprintf()`. 

