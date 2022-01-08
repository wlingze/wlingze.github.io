---
title: sctf2021_pwn
date: 2021-12-29 01:59:02
permalink: /pages/6d05cb/
categories:
  - ctf_wp
  - sctf
tags:
  - 
---
# Sctf2021 pwn 方向部分赛题出题思路

[[toc]]



本次比赛我出的赛题是pwn方向， 一共出了以下几个题目：

简单赛题：

Gadget,  data leak 

开放性赛题：

Christmas Wishes， Christmas Song， Christmas Bash

分别的题解在以下链接



## 简单赛题

### dataleak 

其实这个题目，有年头了，陈年老题, 其实历年来sctf都是在 7月左右举办，于是我三月初开始准备出题啥的，所以这个题目其实从三月四号就出好了 🤭

![image-20211231014332295](https://s2.loli.net/2021/12/31/kXCiO8RmrHWn1aw.png)

最开始其实是cjson这个组件的漏洞 ，主要是 [CVE-2019-11834](https://github.com/DaveGamble/cJSON/issues/337)和[CVE-2019-11835](https://github.com/DaveGamble/cJSON/issues/338)， 

两个cve都可以 实现跳过两个字节的功能，于是设计了这么一个数据泄露的题目 ，

其实我的预期解是通过两个cve一块使用，可以一下泄漏出来完整数据，然后提交得到flag，但是其实只用`/*`就可以，只需要控制好占位即可。

> 其实应该可以出getshell的题目环境吧，但是我计划是按这个当作一个简单题 也就如此了 。

然后这个题目之后我还去看了下sudo那个洞和接下来又写了那个json的题目，后来下半年[liveoverflow也发布了一个视频](https://www.youtube.com/watch?v=zdzcTh9kUrc&ab_channel=LiveOverflow)，这种 c指针魔法确实有趣， have fun， 

[详细题解](https://lingze.xyz/pages/51ab44/)

### Gadget 

出题思路其实来自[这个题目](https://lingze.xyz/pages/ea4dff/)，非常规的gadget拼凑，

偶然遇到的题目，然后做完以后感觉挺有趣，现在很多栈题目使用的gadget都是套路化的那几个gatget，反而变成了模板题目，这个题目想真正考察下对于gadget的拼凑能力吧，

国内ctfpwn这边经常喜欢朝着一个点使劲挖，弄的题目看起来就是只有ctf才能遇到的情况，这个gadget其实是深挖下gadget这个考点，限制啥的又挺多，其实有点像堆大师题的感觉，但其实这个题目也是唯一一个特别ctf化的题目，还是放上来了。

这个题目的编译环境是ollvm编译出的musl libc， 然后使用这个去静态编译出文件来。从而得到的文件中gadget就很少见了。

[详细题解](https://lingze.xyz/pages/baaef3/)



## 开放性赛题

这次比赛出的非常规赛题, 写了个东西，然后拿出来大家一起玩。



### Christmas Wishes

其实最开始没想做成一个php pwn题目，原本就是写了个json parser， 然后模拟一个大的项目中的用来处理json的一个小组件，本身通过这个组件本身可以实现任意地址修改，在和[@AFKL](https://afkl-cuit.github.io/)简单讨论这个思路时提到可以直接做成一个php网站，转成php拓展，由于本来的代码也是模块化出来的于是很简单的修改成了一个php拓展，搭建出来目前这个样子。

不太清楚大家是如何调试的，在出题过程中我的做法是，首先逆向分析这个so拓展文件，然后编写loader直接运行这个so的关键代码，然后调试漏洞， 再搭建起来php的docker环境，堆环境可能有点乱，所以可能需要前面多写一些数据用来清理掉bins， 

> 出题过程中遇到各种bug，也尝试patch so文件hook掉malloc free函数，又编写了一个内存探测的拓展做成web api查看内存， 甚至还修了一个bug， 其实也是个比较有意思的过程，

得到parser_string中的堆溢出(这个是个和年初sudo很像的洞)和delete_item中的单向链表修改， 预期解是这两个配合可以达成任意地址写的效果，修改so文件的free_got为system_plt， 可以反弹shell或者`ls > /tmp/ls`然后读取目录 运行对应的指令即可。也可以直接攻击tcache 修改free_hook， 地址是可以知道的，所以也还比较简单。

[详细题解](https://lingze.xyz/pages/d91dc6/)

### Slang

比较好玩的东西哈哈哈哈哈哈 [sctf pwn language 圣诞特别版](https://github.com/wlingze/Slang/tree/christmas)， 

com部分：变量是gift， 函数调用语句是驯鹿送礼物，只支持内置函数(这几个函数名都是圣诞老人的驯鹿嗷)， 然后许愿语句其实类似switch语句，这个可以达到一个if语句的结构，还有一句`Brave reindeer! Fear no difficulties!` 勇敢驯鹿不怕困难！用来直接跳到switch位置重新跑，这样还可以组合成while语句，

vm部分：原本想弄成python类似的，但是明显的时间不足水平不够。就 比较简单的栈机器直接运行了。

#### Christmas Song

源码题目，直接写代码即可，比较简单

预期解就是open read， 然后使用wint语句形成while进入死循环。

非预期里面比较好玩，有的师傅再次调用open参数为flag， 通过报错可以打印出来flag

[详细题解](https://lingze.xyz/pages/306f8a/)

#### Christmas Bash

对于dis模块的攻击，最开始思路时想做一个线性反编译器的利用，就是通过jmp语句实现 `[header] [jmp2src] [payload] [src]`的结构，然后程序可以正常运行但是调用dis模块触发payload，但是写完以后发现直接可以getshell的payload并没有， 而且也不想去太刻意的构造了。于是就整成了这个样子。

首先 `-r`然后`-r -d`运行，触发dis中的`line_fmt`函数sprintf位置栈溢出，但是这个位置使用%s不能有00，然后`-r -d`的时候 运行位置把栈迁移的地址写入到文件中，dis重新载入文件，会获得这个地址然后栈迁移。

其实是直接写的代码，写完以后审到的主要的漏洞：

* gift结构中的类型混淆  字符和指针不区分，于是可以控制指针各种偏移， 
* dis模块`line_fmt`位置的`sprintf`会出现栈溢出应该使用`snprintf`
* vm运行中对于open read write没有任何限制 可以玩法很多，

预期解的利用：

* vm中memcpy的加入，配合gift类型混淆 其实可以实现取指针操作
* open read可以让scom文件自我修改，只需要覆盖一些前面的head和头几个opcode即可，配合want实现的if结构完全可以让scom每次运行都不一样，
* 提到的scom子修改配合指针操作，可以先把rop链布置在堆中，然后写入文件，配合sprintf的栈溢出实现栈迁移，

[详细题解](https://lingze.xyz/pages/0cbf9f/)



## 总结

说起来很多题目出的还是仓促了，没有考虑周全，又很简单的解法。
