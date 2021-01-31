---
title: lab1_boot
date: 2021-01-25 18:15:39
permalink: /pages/0109c4/
categories:
  - labbb
  - linux_os
tags:
  - 
---
# operating system kernel experiment 1 
# system boot part
# experiment goal 
* **/boot/bootsect.s** custom print information 
* **/boot/setup.s** print hardware information 

# source code analysis 
## boot/bootsect.s 
this step first copies itself to the position of 0x90000, and jumps over to execute, 

then read setup.s to position of 0x90200, 

print information and copy system to the address 0x10000, 

deter the device number of the file system, 

and jump to the setup program to run. 

## boot/setup.s 

the setup program obtains and stores hardware information in the from of bios interruption 

these data are stored starting from 0x90000 
> yes, it will directly overwrite the original bootsect program 

then setup moves the whole block of system from 0x10000 down to 0x00000, 

then load idtr and gdtr, prefrom hardware settings, entry 32-bit, protected mode operation, and jump to the head.s program at  the top of system to run. 

# experiment details 



this experiment is relatively simple, mainly for **printing control** 

## print information 

```assembly
mov $0x3, %ax;
xor %bh, %bh;
int 0x10;
# get current cursor position 

mov $len, %cx;
mov $msg, %bp;
mov $0x0007, %bx; 
mov $0x1301, %ax;
int 0x10;
# print msg 
```



