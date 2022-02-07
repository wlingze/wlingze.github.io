---
title: memory allocator traits
date: 2022-02-02 15:23:26
permalink: /pages/8e8d47/
categories:
  - labbb
  - stl
tags:
  - 
---
# memory allocator traits 

[[toc]]

## 简述 

这个设计主要是为了在cpp标准中，容器使用的分配器可以指定，而这个指定的分配器需要以实例的形式保存。

在stl中我们设计实现的内存分配器对应的函数都是静态函数， 这也是符合预期的，因为这种函数本身也应该是类似malloc/free进行全局调用的，但是对于用户实现的函数，如果其内存分配函数是非静态函数，即我们每次使用都要进行实例化该对象的话，也要满足这种情况。



那么为了达到这个目的。在malloc中实现了一个类似 type_traits的设计。

## `_Alloc_traits` 

对于这个对象的设计如下, 

存在一个bool类型的值，  `_S_instanceless` ， 是否可以忽略实例化。

* 如果为false时， 则不允许忽略实例化，存在一个typedef为allocator_type， 表示该类型。
* 如果为true时， 则可以不进行实例化，那么使用_Alloc_type， 直接调用静态函数。

使用模版设置默认的类型为false，即需要实例化的情况，

然后后面通过偏特化实现对stl默认分配器的设置，都是使用就静态函数。

## 使用

traits的接口做好了，这个traits是为了区分是否需要实例化，为容器使用提供的，接下来就是容器使用部分了。

>  以下两个其实设计思路类似。

### sgistl: _Vector_alloc_base

stl中的容器一般构架是嵌套的继承关系，如下：

`container` <- `_container_base` <- `_container_alloc_base`

其中在`_container_alloc_base`部分通过traits+模版+偏特化 实现对两种分配器的区分，提供最基础的分配功能。

然后在 `_container_base` 中提供对于该容器本身的内存分配和回收工作。

在`container`中实现容器管理的内存和该容器主要功能函数。

其中还使用了 `protected`对象等进行封装。

###  mytinystl: _alloc_base_aux

对于每个容器单独编写一个对应的 `_container_alloc_base`有点麻烦，于是我在实现这一部分的时候选择使用了一个统一个 `_alloc_base_aux`， 继承结构如下：

`container` <- `_container_base` [`_alloc_base_aux`]， 这里为了使继承关系更符合直觉一些， 将`_alloc_base_aux`复合嵌套在了`_container_base`中，

这个做法不太好的一点是在`alloc_base`结构中原本是protected类型并通过继承来访问的对象不能使用了，只能全部public出来，但是在`container_base`中这个复合进来的`alloc_base`也是protected，问题不算太大。

## `alloc_base`实现

### `_alloc_base_aux`

简单来说， 这一部分只需要提供以下几个接口出来: 

* Constructor: `_alloc_base_aux(const allocator_type &__a)`

* typename: `allocator_type `
* `allocator_type  get_allocator()` 
* `_Tp* _M_allocate(size_t __n)` 
* `void _M_deallocate(_Tp *__p, size_t __n)` 

实现如下，分别对应两个偏特化类：

```cpp

template <class _Tp, class _Alloc, bool _isStatic> class _alloc_base_aux {
public:
  typedef typename _Alloc_traits<_Tp, _Alloc>::allocator_type allocator_type;
  allocator_type get_allocator() const { return _M_data_allocator; }

  _alloc_base_aux(const allocator_type &__a) : _M_data_allocator(__a) {}

  allocator_type _M_data_allocator;

  _Tp *_M_allocate(size_t __n) { return _M_data_allocator.allocate(__n); }
  void _M_deallocate(_Tp *__p, size_t __n) {
    if (__p)
      _M_data_allocator.deallocate(__p, __n);
  }
};

template <class _Tp, class _Alloc> class _alloc_base_aux<_Tp, _Alloc, true> {

public:
  typedef typename _Alloc_traits<_Tp, _Alloc>::allocator_type allocator_type;
  typedef typename _Alloc_traits<_Tp, _Alloc>::_Alloc_type _Alloc_type;
  allocator_type get_allocator() const { return allocator_type(); }
  _alloc_base_aux(const allocator_type &__a) {}

  _Tp *_M_allocate(size_t __n) { return _Alloc_type::allocate(__n); }
  void _M_deallocate(_Tp *__p, size_t __n) {
    if (__p)
      _Alloc_type::deallocate(__p, __n);
  }
};
```

然后在使用的时候：

```
  typedef _alloc_base_aux<_Tp, _Alloc,
                          _Alloc_traits<_Tp, _Alloc>::_S_instanceless>
      _alloc;
```

后续使用`_alloc`进行复合构造， 实现`_container_base`即可。

### `_vector_alloc_base` 

看下sgistl中的实现，其实是类似的， 

对于`alloc_base`的实现如下:

```cpp

// Base class for ordinary allocators.
template <class _Tp, class _Allocator, bool _IsStatic>
class _Vector_alloc_base {
public:
  typedef
      typename _Alloc_traits<_Tp, _Allocator>::allocator_type allocator_type;
  allocator_type get_allocator() const { return _M_data_allocator; }

  _Vector_alloc_base(const allocator_type &__a)
      : _M_data_allocator(__a), _M_start(0), _M_finish(0),
        _M_end_of_storage(0) {}

protected:
  allocator_type _M_data_allocator;
  _Tp *_M_start;
  _Tp *_M_finish;
  _Tp *_M_end_of_storage;

  _Tp *_M_allocate(size_t __n) { return _M_data_allocator.allocate(__n); }
  void _M_deallocate(_Tp *__p, size_t __n) {
    if (__p)
      _M_data_allocator.deallocate(__p, __n);
  }
};

// Specialization for allocators that have the property that we don't
// actually have to store an allocator object.
template <class _Tp, class _Allocator>
class _Vector_alloc_base<_Tp, _Allocator, true> {
public:
  typedef
      typename _Alloc_traits<_Tp, _Allocator>::allocator_type allocator_type;
  allocator_type get_allocator() const { return allocator_type(); }

  _Vector_alloc_base(const allocator_type &)
      : _M_start(0), _M_finish(0), _M_end_of_storage(0) {}

protected:
  _Tp *_M_start;
  _Tp *_M_finish;
  _Tp *_M_end_of_storage;

  typedef typename _Alloc_traits<_Tp, _Allocator>::_Alloc_type _Alloc_type;
  _Tp *_M_allocate(size_t __n) { return _Alloc_type::allocate(__n); }
  void _M_deallocate(_Tp *__p, size_t __n) {
    _Alloc_type::deallocate(__p, __n);
  }
};
```

其实只有两个值， 所以第一个模版第二个特化不需要实例化的时候，也就是第一个是需要实例化 第二个不需要实例化， 也是两种情况的实现。

使用的位置在 `vector_base`

```cpp

template <class _Tp, class _Alloc>
struct _Vector_base
    : public _Vector_alloc_base<_Tp, _Alloc,
                                _Alloc_traits<_Tp, _Alloc>::_S_instanceless> {}
```

