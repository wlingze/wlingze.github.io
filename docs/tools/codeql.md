---
title: codeql
date: 2021-03-24 16:47:16
permalink: /pages/1948eb/
categories:
  - tools
tags:
  - 
---
# codeql 入门

[[toc]]

一个挺有趣的思路，将代码整理成某种格式的数据库， 然后使用类sql语法进行查询，从而更加效率的进行源码审计，

入门推荐跟着 [github发布的课程](https://lab.github.com/githubtraining/codeql-u-boot-challenge-(cc++)) 做即可，

相关文档： 

* [ql tutorials](https://codeql.github.com/docs/writing-codeql-queries/introduction-to-ql/)
* [codeql-documentation](https://codeql.github.com/docs/)

## 环境

主要使用vscode, 

首先下载[codeqlcli二进制文件](https://github.com/github/codeql-cli-binaries/releases)，并且设置环境变量，

```sh
echo "export PATH=\$PATH:/usr/class/codeql" >> ~/.zshrc
source ~/.zshrc
```

vscode下载[codeql的拓展](https://github.com/github/vscode-codeql)，直接在vscode内下载也可，然后设置下`Extensions > Code Ql > Cli: Executable Path`写入对应codeql文件路径，

并在vscode中打开[此工作区](https://github.com/github/vscode-codeql-starter/)， 并且记得以递归方式clone下来这个仓库

```sh 
git clone --recursive git@github.com:github/vscode-codeql-starter.git
```

然后导入数据库，并将查询文件保存的那个文件夹从此工作区中打开，

## ql语法

这是一种[声明式编程](https://zh.wikipedia.org/wiki/%E5%AE%A3%E5%91%8A%E5%BC%8F%E7%B7%A8%E7%A8%8B)，这类语言主要是在描述规则关系或者函数映射，主要是来描述问题(what)，而常规的[指令式编程](https://zh.wikipedia.org/wiki/%E6%8C%87%E4%BB%A4%E5%BC%8F%E7%B7%A8%E7%A8%8B)主要是写运行如何处理问题(how)，

ql其实和sql有些相似，但也有不同， 他们都是在描述逻辑规则，他们都是声明式编程中的[逻辑编程](https://zh.wikipedia.org/wiki/%E9%82%8F%E8%BC%AF%E7%B7%A8%E7%A8%8B)。

ql主要使用逻辑连接词(如`and` `or` `not`)， 限定词(如`forall` `exists`)， 还有谓词(`predicates`)等重要逻辑概念。同时ql也提供了递归的支持和聚合(如`count` `sum` `average`)。

详细的示例使用可以跟着[官方示例](https://codeql.github.com/docs/writing-codeql-queries/ql-tutorials/)来学习.

### 基础

大多数时候我们的查询是这样子的：

```sql
import <language> /* 导入对应的语言包 */

/* 可能存在的 一些谓词 类的设置 */

from /* 声明变量等 */
where /* 设置逻辑表达式 */
select /* 打印结果 */
```

### 类型

codeql中存在5种类型: `int` `date` `float` `boolean` `string`， 每个类型有对应的谓词(也可以先理解为函数)可以被调用， 如下例：

```sql
select "hello world".length() 
```

### where逻辑表达式

可以使用`and` `or` 等连接各个表达式，使用exists定义局部变量，

有一种比较有趣的使用方式，这表示`t.getHairColor()`肯定和一个字符串匹配，

```sql
exists(string c| t.getHairColor() = c)
```

下面这是另一个示例， 表示肯定存在一个person的年龄比t大，但我们也不想知道这个大的是哪个，只是表示t不是最大年龄这个意思。

```sql 
exists(Person p| p.getAge() > t.getAge()) 
```

### 聚合

聚合函数，`max` `count` `min` `sum` `avg` 

下面的示例就是配合`exists`选取最大的年龄，

```sql
from Person t 
where t.getAge() = max(int i | exists(Person p | p.getAge() = i) | i)
select t
```

但是我们也可以使用`order by` 关键字

```sql 
select max(Person p | | p order by p.getAge())
```



### 谓词 **Predicate**

谓词有点类似函数的意思，但是并不完全等同于函数，他也是一种描述，来指示某种状态，

无返回值的谓词其实有点像宏的意思，他会直接替换过来,

```sql 
predicate isSouthern(Person p){
	p.getLocation() = "south"
}

from Person p 
where isSouthern(p)
select p 
```

有返回值的谓词通过`result`来表示返回的值，而且这里的`result`也可以理解为一个类型是该谓词返回类型的变量，也可以被函数调用等，如下示：

```sql
Person relativeOf(Person p){
	parentOf(result) = parentOf(p)
}
Person childOf(Person p){
  p = parentOf(result)
}
```

### 判断语句

在ql语言中是不存在if for等语法的，循环一般通过递归实现，判断一般通过逻辑表达式实现：

```sql 
string other() {
  this = "Left" and result = "Right" 
  or 
  this = "Right" and result = "Left" 
}
```



### 定义类

可以自己定义类型，定义类，这里的类其实是类似集合的概念，表示符合某种属性的集合



```sql
class SmallInt extends int {3
	SmallInt() {this in [1..10] }
	int square() {result = this * this}
}

class Southerner extends Person {
	Southerner () {
		this.getLocation() = "south"
	}
}
```

类中的谓词也可以重写，这里语法有点类似oop中的类中的方法的重写

```sql 
class Child extends Person {
	Child () {
		this.getAge() < 10 
	}
  	override predicate isAllowedIn(string region){
      region = this.getLocation()
  }
}
```


### 递归

这其实是谓词的一种特性，可以轻易的使用递归，

这里介绍一个最简单的递归类型, 在定义中调用了自己本身

```sql 
Person ancestorOf(Person p){
  result = parentOf(p) or 
  result = parentOf(ancestorOf(p))
}
```

### 传递闭包

同一个操作被多次使用(这里的`ancestorOf()`操作)在ql中比较常见，这种操作称为传递闭包，

其中两个符号非常有用，`+` `*` 

在递归的例子中展示的`parentOf()`来演示：

* `parentOf+(p)` 将会调用p一次到多次，等同于上面的`ancestorOf(p)`，
* `parentOf*(p)` 将会调用p 0次到多次，他会返回p和p的祖先，





### codeql查询

首先是在最开始导入对应的语言库，`import <language>` 

