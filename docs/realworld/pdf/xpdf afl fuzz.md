---
title: xpdf afl fuzz
date: 2022-04-08 15:32:07
permalink: /pages/08d22e/
categories:
  - realworld
  - pdf
tags:
  - 
---
# xpdf afl fuzz 

[[toc]]

记录一次失败的fuzz经历，

其实去年九月有fuzz过pycdc但是一直没有笔记，过年的时候更换系统文件都丢了，觉得很可惜，于是这次稍微记录一下，

> 因为工作原因在写golang, 然后在fuzz测试过程中写了一些小工具都是python， 
>
> xpdf这个cpp让我看的非常之  **噎得慌**

## fuzz 部分

因为也没什么好想法去魔改fuzzer，就是直接开始aflpp跑了，目标也有源码直接可以标准的进行测试。

我在[mozila/pdf.js/test](https://github.com/mozilla/pdf.js/tree/master/test/pdfs)找到了大量的输入样例，然后直接开始跑。

## crash分类

跑了大概三四个小时？大概出现了36k左右的crash, afl会记录非重复的crash, 于是只有780左右被记录了下来，

然后面临第一个问题是如何进行crash分类， 之前pycdc的fuzz中我编写过一个 生成gdb脚本然后获取gdb logfile并通过其中的栈回溯进行分类的小工具，效果还可，但是没封装到一块，好几个指令显得有点笨。

然后看了下[afl-utils](https://gitlab.com/rc0r/afl-utils)工具， 发现他其实也是这个思路，而且其中的gdb脚本直接用了另一个项目[exploitable](https://github.com/jfoote/exploitable), 

但是这里有很多比较粗糙的地方，

* 对于重复的判断只是通过文件的hash,  
  * 可能出现很多相同的crash， 按照栈回溯去重更稳妥一些。
* 在获取gdb运行结果的时候直接通过 `subprocess.check_output`进行， 
  * 主要是没有管其他插件的加载问题， 万一有个gef pwngdb, 那么这个每次运行整个context都会被检测一遍，这个简直不可忍受。

于是我对这个程序进行了一些小修改，主要是以上两点。

然后对于exploitable， 增加了一个[对于是否在运行的检测](https://github.com/wlingze/exploitable/commit/4f63e52722fc37750e9c5f8e9cb9b4f6d6835d1a)，有一些crash崩溃后直接退出，运行exploitable的话会报错， 这一部分的原因我还没搞清楚。

于是经过这两个工具的处理，上面的780左右的crash剩下了33个， 

这里我发现了一个这套工具存在的问题： 

* 对于栈回溯的判断是整个栈回溯的hash, 会有一些崩溃点相同的crash, 

这个问题的话，可以增加一个对于crash崩溃点向上两/三层的记录+比较，但是也会不太稳，决定宁可误判不能放过，没改。

然后人工稍微看一下，就剩下了7个crash。

## 分析 

### gmallocn 

这个比较简单，其实就是xpdf内部内存全部使用统一的接口去申请，然后如果过大会触发`gMemError`  

```cpp
void *gmallocn(int nObjs, int objSize) GMEM_EXCEP {
  int n;

  if (nObjs == 0) {
    return NULL;
  }
  n = nObjs * objSize;
  if (objSize <= 0 || nObjs < 0 || nObjs >= INT_MAX / objSize) {
    gMemError("Bogus memory allocation size");
  }
  return gmalloc(n);
}
```

这个就是检查出错了，但是因为下层有调用`throw` 会触发crash.

### dos

有三个不同的dos洞， 发现这种东西确实特别容易写出来dos， 只要引用循环基本上就会开始无限递归。

然后看了下论坛发现大伙都已经交过了，而且作者说下个大版本xpdf 5系列会加入对象引用循环的检测，这几个crash也索然无味。

### null指针引用

这个也没啥用，因为有的初始化在if语句内，如果特殊构造不进入if 直接运行接下来的逻辑会出现对0指针的引用，会造成crash, 但是不会崩溃。

## 改进

以后应该看一下结构化fuzz之类实现，afl的bit级别的变异对于纯二进制文件来说挺合适的，但是pdf中只有stream中是这样的， 整体来说pdf还是有自己的比较严格的格式的文件，afl的变异策略并不适合来进行pdf的fuzz。

