---
title: vector implemetation
date: 2022-02-07 12:41:23
permalink: /pages/24e379/
categories:
  - labbb
  - stl
tags:
  - 
---

# vector implementation 

[[toc]]

## 结构

### 实现上的结构

这个在 allocator traits一节我们提到过，

在sgistl中容器结构为, `vector` <- `_vector_base` <- `_vector_alloc_base`。 

在我的tinystl中结构；`vector` <- `_vector_base`[`_alloc_base_aux`] 

其实是类似的，alloc_base实现对[需要实例化的分配器] 和 [不需要实例化的分配器]的统一封装， 提供统一的内存获取和回收函数，然后`_vector_base`实现对vector结构体本身的创建和删除， `vector`实现主要的功能和对其内部储存的数据的创建和销毁。

也就是 `vector_base`的创建销毁函数是向`vector`本身负责，而`vector`内的创建销毁函数是向内部储存的数据负责。

### 设计上的结构

vector的设计就是片连续内存空间，并且可以增长和缩减。类似于 自动动态增长的数组。

为了实现这一点，有三个重要成员变量:

* `_M_start` 表示内存的起点， 同时也是数据的起点。
* `_M_end_of_storage` 表示获得的内存的终点。
* `_M_finish`表示保存的数据的终点。

## 功能

### 基础功能

基础的begin end等比较简单，不再赘述

### 构造和析构函数

构造函数有关分配器、vector内存容量的要转入`_vector_base`的构造函数中。

构造函数支持以下几种参数：

* `vector(const allocator_type &__a = allocator_type()) `， 使用__a作为分配器，定义一个空的vector，
* `vector(size_type __n, const value_type &__v,  const allocator_type &__a = allocator_type()) ` 拥有`__n`个`__v`数据的vector
* `vector(size_type __n)  `可以看作上面那个的特殊化，__n个默认数值的vector
* `vector(const vector<_Tp, _Alloc> &__x)`,   通过另一个vector构造
* ` vector(_InputIterator __first, _InputIterator __last, const allocator_type &__a = allocator_type())`, 通过两个迭代器构造。

析构函数实现比较简单，只需要destory整个vector内的数据即可，然后在vector_base销毁的时候回收整个vector的内存，

### 运算符重载

这里要实现对于赋值语句的重载， 然后是`[]`运算符， 

在全局运算符中要设置 `==` 和 `<`两个符号，但是基本也是调用stl算法部分实现。

### 内存拓展相关

对赋值语句的重载也是内存拓展相关的一部分。还包括push pop insert reserve  erase等， 

最主要的一点在与如果对vector的内存进行拓展， 要关注对原数值的复制/填充。

关键的点在于，要区分 要操作的内存是否已经被构造了。

* 如果被构造过，那么可以直接使用copy/fill函数，
* 如果没有运行过构造函数，则要使用uninitialized_copy/fill函数

## 内存拓展实现-insert 

简单记录下insert的实现，在vector的实现中，这个算是比较复杂的一个了。

### 设计

insert可以接受三种参数：

* `insert(iterator __position, const_reference __v = value_type())`， 在`__position` 位置插入`__v`, 
* `insert(iterator __positon, size_type __n, const _Tp &__x)`在`__position`位置插入`__n`个`__v`， 
* `insert(iterator __position, _InputIter __first, _InputIter __last) `向`__position`位置插入`[__first, __last)`, 
  * 这种情况要注意一点，如果_Tp=size_typ的话，那么可能会将第二种情况误判到这里，所以要通过`_Is_integer`进行判断，迭代器肯定不会是integer。

### 实现

直接插入一个数值，

* 首先判断下是否需要拓展内存了，
  * 如果需要的话进入`_M_insert_aux` ，申请一块大内存，复制前部分、插入`__v`、复制后部分即可。
* 如果是末尾一个的话，也就等同push_back， 前面判断过不需要拓展，那么直接放在最后，
  * 这里注意`_M_finish`是没有初始化的， 所以直接使用`construct`
* 如果插入中间，则直接`[_pos, _M_finish)`复制到`[_pos+1, _M_finish+1)`即可，但是这里`_M_finish`没初始化则先进行初始化，然后可以copy， 

```cpp
  iterator insert(iterator __position, const_reference __v = value_type()) {
    size_type distance = __position - _M_start;
    if (_M_finish == _M_end_of_storage) {
      _M_insert_aux(__position, __v);
    } else if (__position == _M_finish) {
      construct(_M_finish, __v);
      _M_finish++;
    } else {
      construct(_M_finish, *(_M_finish - 1));
      _M_finish++;
      copy(__position, _M_finish, __position + 1);
      *__position = __v;
    }
    return _M_start + distance;
  }

  void _M_insert_aux(iterator __p, const_reference __v) {
    size_type _old_size = size();
    size_type _new_size = _old_size ? _old_size * 2 : 1;
    iterator _new_start = _M_allocate(_new_size);
    iterator _new_finish = _new_start;
    __STL_TRY {
      _new_finish = uninitialized_copy(_M_start, __p, _new_start);
      construct(_new_finish, __v);
      _new_finish++;
      _new_finish = uninitialized_copy(__p, _M_finish, _new_finish);
    }
    __STL_UNWIND(destory(_new_start, _new_finish);
                 _M_deallocate(_new_start, _new_size);)
    destory(begin(), end());
    _M_deallocate(_M_start, _M_end_of_storage - _M_start);
    _M_start = _new_start;
    _M_finish = _new_finish;
    _M_end_of_storage = _new_start + _new_size;
  }
```

我们提到了，如果_Tp=size_typ的话，那么可能会将第二种情况误判到第三种情况。

```cpp
  void insert(iterator __position, size_type __n, const _Tp &__x) {
    _M_fill_insert(__position, __n, __x);
  }

  template <class _InputIter>
  void insert(iterator __position, _InputIter __first, _InputIter __last) {
    typedef typename _Is_integer<_InputIter>::_Integral _is_integral;
    _M_insert_dispatch(__position, __first, __last, _is_integral());
  }

  template <class _Integer>
  void _M_insert_dispatch(iterator __p, _Integer __n, _Integer __v,
                          __true_type) {
    _M_fill_insert(__p, (size_type)__n, (value_type)__v);
  }

  template <class _InputIter>
  void _M_insert_dispatch(iterator __p, _InputIter __first, _InputIter __last,
                          __false_type) {
    _M_range_insert(__p, __first, __last);
  }

```

### _M_fill_insert

这里需要特别注意， vector中内存状态是`[start, finish), end]`， start-finish之间是初始化以后的内存， finish-end是未初始化的，因此要对几个状态分别进行判断和处理。

```cpp

  /*
    [start : __p : finish)--end], -> [start:__v*__n:finish)--end]
  */
  void _M_fill_insert(iterator __p, size_type __n, const_reference __v) {
    if (!__n)
      return;

    if ((_M_end_of_storage - _M_finish) > __n) {
      // sufficient memory
      const size_type _distance = _M_finish - __p;

      if (_distance > __n) {
        /*
          [start, fill copy |finish| uninitialize_copy]
          p->p+n->f->f+n
            f, f+n  <=  f-n, f  u_copy
            p+n, f  <=  p, f-n  copy
            p, p+n              fill

        */
        uninitialized_copy(_M_finish - __n, _M_finish, _M_finish);
        copy(__p, _M_finish - __n, __p + __n);
        _M_finish += __n;
        fill_n(__p, __n, __v);
      } else {
        /*
          [start, fill,|finish| uninitialize_fill,  uninitialize_copy]

           p->f->p+n->f+n
            p+n, f+n <= p, f u_copy
            f, p+n           u_fill_n
            p, f             fill_n
        */
        uninitialized_copy(__p, _M_finish, __p + __n);
        uninitialized_fill_n(_M_finish, __n, __v);
        _M_finish += __n;
        fill_n(__p, __n, __v);
      }
    } else {
      // insufficient memory, allocate memory again.

      /*
        s->p->f
        s->i . i->f
      */
      size_type _old_size = size();
      size_type _new_size = _old_size + max(_old_size, __n);
      iterator _new_start = _M_allocate(_new_size);
      iterator _new_finish = _new_start;
      __STL_TRY {
        _new_finish = uninitialized_copy(_M_start, __p, _new_start);
        _new_finish = uninitialized_fill_n(_new_finish, __n, __v);
        _new_finish = uninitialized_copy(__p, _M_finish, _new_finish);
      }
      __STL_UNWIND(destory(_new_start, _new_finish);
                   _M_deallocate(_new_start, _new_size);)
      destory(_M_start, _M_finish);
      _M_deallocate(_M_start, _M_end_of_storage - _M_start);
      _M_start = _new_start;
      _M_finish = _new_finish;
      _M_end_of_storage = _new_start + _new_size;
    }
  }
```



### _M_range_insert

 和`_M_fill_insert`一样，对几个位置分别进行处理。

```cpp

  void _M_range_insert(iterator __p, iterator __first, iterator __last) {
    if (__first == __last)
      return;
    if ((_M_end_of_storage - _M_start) > (__last - __first)) {
      const size_type _n = __last - __first;
      const size_type _distance = _M_finish - __p;
      if (_distance > _n) {
        /*
          s p p+n f f+n
        */
        uninitialized_copy(_M_finish - _n, _M_finish, _M_finish);
        copy(__p, _M_finish - _n, __p + _n);
        copy(__first, __last, __p);
        _M_finish += _n;
      } else {
        /*
          s p f p+n f+n
        */
        uninitialized_copy(__p, _M_finish, __p + _n);
        copy(__first, __first + _distance, __p);
        uninitialized_copy(__first + _distance, __last, __p);
        _M_finish += _n;
      }
    } else {
      size_type _n = __last - __first;
      size_type _old_size = size();
      size_type _new_size = _old_size + max(_old_size, _n);
      iterator _new_start = _M_allocate(_new_size);
      iterator _new_finish = _new_start;
      __STL_TRY {
        _new_finish = uninitialized_copy(_M_start, __p, _new_start);
        _new_finish = uninitialized_copy(__first, __last, _new_finish);
        _new_finish = uninitialized_copy(__p, _M_finish, _new_finish);
      }
      __STL_UNWIND(destory(_new_start, _new_finish);
                   _M_deallocate(_new_start, _new_size);)
      _M_start = _new_start;
      _M_finish = _new_finish;
      _M_end_of_storage = _M_start + _new_size;
    }
  }
```

