---
title: source2_init
date: 2021-01-26 11:49:48
permalink: /pages/c7b9e2/
categories:
  - labbb
  - linux_os
tags:
  - 
---
# linux kernel source code analysis 1 
# init part 
the corresponding file in the `/init/` , and only one file `/init/main.c` 


after the head program is executed, it will be automatically transferred to main.c for executed. 

this contains all the work of kernel initialization, and loads the shell for interaction. 

**init program execution flow** 
![init program execution flow ](https://i.loli.net/2021/01/26/k1UVPOQta9JYCBR.png)

