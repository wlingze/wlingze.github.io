---
title: iterator and traits
date: 2022-01-27 02:25:54
permalink: /pages/7f7968/
categories:
  - labbb
  - stl
tags:
  - 
---
# iterator and traits

[[toc]]

## auto_ptr

在`memory`头文件中定义。这是最基本的智能指针。

它只封装了一个变量，一个相应类型的指针，它可以通过指针或另一个`auto_ptr`来构造。

不允许两个`auto_ptr`共享同一个内存指针。

当 "auto_ptr "实例被释放时，相应的指针会被自动清理掉。(由析构器实现)

为了模仿默认指针，`auto_ptr`重载了操作符 `*` `->` 。

## traits programming technique

### 思想

其实仍然是想对不同操作进行分发，

如果使用值进行标记的话，我们会牺牲一定的储存空间，并且这个操作是通过代码进行判断的，会占据运行时间和影响代码可读性。

如果使用类型进行标记，不会牺牲储存空间，同函数名不同参数类型在cpp中称为函数重载，于是进行分发的任务交给了编译器。

这是一种牺牲编译时间换取效率和代码可读性的操作。

### type & traits 

事实上，在cpp支持 "模板 "之后，带来了 "通用编程 "的可能性，并带有 "命名空间"、类型判断等。

类型也可以被看作是一种特殊的变量。

我们可以得到它们，并通过它们对各种属性做一些定义。

而传递一个内部为空的类的实例，实际上并不占用内存。

所以在`stl`里面，这种操作经常被使用，我们称之为`traits编程技术`。

### 示例

最经典的使用是在对于不同迭代器的分发上，

迭代器的步长存在多种情况，我们从一个简单角度来看，存在只允许单步走和可以跨步两类，

现在要实现一个 到对应位置的操作，

- 可以跨步的，我们可以直接实现 p+n,
- 对于单步， 我们需要  while(n—) p++;

于是对于这两个类我们实现出了两个，对于跨步成为A类型，单步称为B

```cpp
class A {}
class B {}

class iteratorA{
public:
	typedef A step;
.....
}

class iteratorB{
public:
	typedef B step;
.....
}
```

对应两个函数， 我们分别设置不同的参数，

```cpp
__ggoto(iterator __p, int __n, A )
__ggoto(iterator __p, int __n, B )
```

我们构造一个统一的traits接口返回对应类型实例

```cpp
typename _Iter::step 
iterator_tarit_step(_Iter _i){
	typedef  _Iter::step step;
	return step();
}
```

那么就可以使用统一的接口， 这个分发到两个不同`__ggoto`的操作通过编译器的类型判断实现。

```cpp
ggoto(iterator __p, int __n){
	__ggoto(__p, __n, iterator_tarit_step(__p));
}
```

如果不这样的话， 

我们原本使用值进行分发的时候，需要设置对应的数值并使用代码判断响应数值， 

```cpp
switch(flag_step){
	case 1:
		__ggoto_one(__p, __n);
	case 2:
		__ggoto_jmp(__p, __n);
}
```

这样的坏处， 

- 使用数值传递会占用多一个数据位， 可能本身功能不需要内存空间，反而因为flag位导致内存空间的使用，导致效率问题甚至内存问题。
- 使用数值传递必须使用用户层的代码进行判断，
- 如果flag情况较多的话，switch结构会迅速膨胀。而且修改麻烦。

而使用trait手段， 是使用变量类型来进行标记，并通过编译部分的类型判断完成原本switch的工作，编译时增加时间，但是运行时会提高效率和安全度。



## 迭代器

所谓的`interator`是一种智能指针，类似于我们上面的`auto_ptr`。

我们一般在容器中使用它，并重载操作符，如`++``--`，使其与本地指针一致，用于算法中。

迭代器是容器和算法之间的桥梁。

### 实现

对于类来说，声明内联类型是个好主意。所以我们可以看到，在stl的in容器定义中有很多`typedef`。

这看起来不错，但是对于默认指针类型，我们希望stl中定义的容器与系统定义的默认类型使用方式相同。

对于stl中定义的容器，可以内嵌类型， 但是对于 `int *`之类的系统定义类型的指针，却没办法。

所以我们可以在这里添加中间层，建立一个叫做 "trait "的类，让所有的类型通过这个类，通过一个模板得到它们相应的类型。

- 对于容器来说，它直接进入嵌入容器中的类型。
- 对于默认类型，它由偏特殊化进行特别指定。

所以所有的类型都可以被抽象化。

## type_traits

将traits的概念引申到普通类型上，对于一些普通类型的操作，我们也期望了解一些相关概念，于是sgistl中出现type_traits的概念，

每个量其实只有true false两种值，

```cpp

struct __true_type {};
struct __false_type {};

template <class _Tp> struct __type_traits {
  typedef __true_type this_dummy_member_must_be_first;
  /*
      This variable is used to indicate to some compilers that can support
     automatic specialization of __type_trait that this __type_traits is
     special.
  */

  typedef __false_type has_trivial_default_constructor;
  typedef __false_type has_trivial_copy_constructor;
  typedef __false_type has_assignment_operator;
  typedef __false_type has_trivial_destructor;
  typedef __false_type is_POD_type;
};
```

比较重要的是构造和析构函数相关， 这些被使用在全局析构函数和内存复制相关的函数中，

```cpp
template <class _ForwardIterator>
inline void destroy(_ForwardIterator __first, _ForwardIterator __last);
```

## cpp模版元编程

将traits中将控制流交给编译器的类型判断位置的思想延伸， 存在这一种编程方式， 完全使用编译器的类型判断，配合模板、特化、偏特化的配合，将程序中所有的控制流都交给编译器。



写出来代码的样子如下， 其实只有声明 这个模板类的属性，然后对应几个特殊属性，最后直接获取对应的数据。

```cpp
#include <iostream>

template<int N>
class aTMP{
public:
    enum { ret = N * aTMP<N-1>::ret };
};
template<>
class aTMP<0>{
public:
    enum { ret = 1 };
};

int main(){
    std::cout << aTMP<10>::ret << '\n';
    std::cin.get(); return 0;
}
```

这个想法已经[开始接近声明式语言](https://www.zhihu.com/question/39637015)。

---------

cpp真是nb， 向下可以到c， 向上有oop和gp两大块， oop引申到设计模式，gp引申到声明式语言， 都玩法无限， 还有stl boost等大型库的支撑， 真的是表现力拉满。

