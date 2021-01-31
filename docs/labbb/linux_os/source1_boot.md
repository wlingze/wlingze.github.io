---
title: source1_boot
date: 2021-01-25 21:35:20
permalink: /pages/c17299/
categories:
  - labbb
  - linux_os
tags:
  - 
---
# linux kernel source code analysis 1
# boot  part 

the corresponding file is in the `src/boot/` directory, 

these are three assembly file, 

----
bootsect.s and setup.s use 16-bit assembly syntax in real mode.

head.s uses 32-bit protected mode assembly syntax.

# pre-knowledge 


## bios 

> what happened after power up ?
>
> bios satrts and runs, and switches to bootseect 

when the PC power is turned on, the cup under the 80-x86 architecture, automatically enters real mode, and automatically execute from 0xffff0, 

this address is usually the address of rom-bios, bios will perform system decection, and initialize the interrupt vector from physical address 0, 

after that, the first sector (boot sector) of the device will be started, read into the memory at 0x7c00, and jump to this place. 

> so enter the code of the boot part below.

## summary

in fact, what bootloader does is simply move the kernel module, set the hardware informantion and the new interrupt vector, and enter the 32-bit protection mode.

**p1** the system is powered on to start the operation process:
![the system is powered on to start the operation process](https://i.loli.net/2021/01/25/IKm7ZWwxc6H1rFJ.png)
**p2** the kernel's position is memory changes when booting:
![the kernel's position is memory changes when booting](https://i.loli.net/2021/01/25/kE5GSmvZ91LAPBD.png)
# bootsect 

code move 

# setup 

get hardware informantion

# head 




