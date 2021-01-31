---
title: lab2_systemcall
date: 2021-01-25 18:19:48
permalink: /pages/b52e48/
categories:
  - labbb
  - linux_os
tags:
  - 
---
# operating system kernel experiment 2 
# System call part 

# source code 

The main positions of the code are `kernel/system_call.s`, `kernel/Makefile`, `include/linux/sys.h`, `include/unistd.h`, 

# main operation 

Modify `kernel/Makefile`, add `who.o` to the link parameters, 

Modify the `nr_system_calls` of `kernel/system_call.s` , modify the number of system call. 

Added `_NR_whoami` definition to `include/unistd.h`.

Added the `sys_whoami` function pointer to the end of the `sys_call_table` array in `include/linux/sys.h`.

