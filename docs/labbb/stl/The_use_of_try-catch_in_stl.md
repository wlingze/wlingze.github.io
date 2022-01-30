---
title: The use of try-catch in stl
date: 2022-01-30 07:50:02
permalink: /pages/35fd02/
categories:
  - labbb
  - stl
tags:
  - 
---
# try-catch的使用

[[toc]]

# try-catch保证数据完整性。

## 前置

在stl中，对于uninitialized系列函数实现中真正的功能函数位置其实有加入错误处理机制。

使用try-catch结构用来保证写入数据的完整性，如果中间某一个失败 那么会将所有数据都销毁。

比如以下这个：

```cpp
template <class _ForwardIter, class _Tp>
void __uninitialized_fill_aux(_ForwardIter __first, _ForwardIter __last,
                              const _Tp &__x, __false_type) {
  _ForwardIter __cur = __first;
  __STL_TRY {
    for (; __cur != __last; ++__cur)
      _Construct(&*__cur, __x);
  }
  __STL_UNWIND(_Destroy(__first, __cur));
}
```

相关的两个宏定义:

```cpp
#define __STL_TRY try

#define __STL_UNWIND(action)                                                   \
  catch (...) {                                                                \
    action;                                                                    \
    throw;                                                                     \
  }
```

注意这个throw直接使用，会放弃当前的错误处理阶段，并直接将这个错误向上传到上级函数内进行处理，如果上层函数没有进行处理，那么会中断整个程序的运行。

## 嵌套使用

### uninitialized-[copy+fill]系列

在实现 uninitialized系列函数以后，又实现了三个嵌套函数，copy-copy, copy-fill, fill-copy。定义如下：

```cpp
// __uninitialized_copy_copy
// Copies [first1, last1) into [result, result + (last1 - first1)), and
//  copies [first2, last2) into
//  [result, result + (last1 - first1) + (last2 - first2)).

template <class _InputIter1, class _InputIter2, class _ForwardIter>
inline _ForwardIter
__uninitialized_copy_copy(_InputIter1 __first1, _InputIter1 __last1,
                          _InputIter2 __first2, _InputIter2 __last2,
                          _ForwardIter __result) {
  _ForwardIter __mid = uninitialized_copy(__first1, __last1, __result);
  __STL_TRY { return uninitialized_copy(__first2, __last2, __mid); }
  __STL_UNWIND(_Destroy(__result, __mid));
}

// __uninitialized_fill_copy
// Fills [result, mid) with x, and copies [first, last) into
//  [mid, mid + (last - first)).
template <class _ForwardIter, class _Tp, class _InputIter>
inline _ForwardIter
__uninitialized_fill_copy(_ForwardIter __result, _ForwardIter __mid,
                          const _Tp &__x, _InputIter __first,
                          _InputIter __last) {
  uninitialized_fill(__result, __mid, __x);
  __STL_TRY { return uninitialized_copy(__first, __last, __mid); }
  __STL_UNWIND(_Destroy(__result, __mid));
}

// __uninitialized_copy_fill
// Copies [first1, last1) into [first2, first2 + (last1 - first1)), and
//  fills [first2 + (last1 - first1), last2) with x.
template <class _InputIter, class _ForwardIter, class _Tp>
inline void __uninitialized_copy_fill(_InputIter __first1, _InputIter __last1,
                                      _ForwardIter __first2,
                                      _ForwardIter __last2, const _Tp &__x) {
  _ForwardIter __mid2 = uninitialized_copy(__first1, __last1, __first2);
  __STL_TRY { uninitialized_fill(__mid2, __last2, __x); }
  __STL_UNWIND(_Destroy(__first2, __mid2));
}
```

其实三个的定义是类似的。

但是要注意一个点，目前期望保护的是完整的整个数据， 

我们通过copy_fill来表示，首先将first1-last1复制到first2-mid, 然后使用x 填充mid-last2, 

其实对于copy和fill内部都有实现错误处理，也就是我们的first2-mid和mid-last2都是安全的，但是对于这两者的衔接还需要一个try-catch来表示。

于是， 

- 首先获取第一段copy，如果copy出问题那么会将first2-mid完全销毁并向上传输错误，由于这个位置没有错误处理，于是直接程序中断，这是安全的。
- 然后进入fill， 这一段如果出错那么 mid-last2也会销毁，但是同时我们还要销毁first2-mid， 于是这一段套在try-catch中，如果出现错误，那么在catch中销毁first2-mid,

### vector `_M_insert_aux` 的使用

在vector中也有一个类似的位置。

在内存不够进行扩容时， 会调用`_M_insert_aux`函数，

这个函数就是先对前面的进行复制， 然后插入一个元素，再对后面的进行复制， 我们也可以看到对应的try-catch结构

```cpp
		const size_type __old_size = size();
    const size_type __len = __old_size != 0 ? 2 * __old_size : 1;
    iterator __new_start = _M_allocate(__len);
    iterator __new_finish = __new_start;
    __STL_TRY {
      __new_finish = uninitialized_copy(_M_start, __position, __new_start);
      construct(__new_finish);
      ++__new_finish;
      __new_finish = uninitialized_copy(__position, _M_finish, __new_finish);
    }
    __STL_UNWIND((destroy(__new_start,__new_finish), 
                  _M_deallocate(__new_start,__len)));
    destroy(begin(), end());
    _M_deallocate(_M_start, _M_end_of_storage - _M_start);
    _M_start = __new_start;
    _M_finish = __new_finish;
    _M_end_of_storage = __new_start + __len;
```

这个同样是为了实现出错销毁所有的功能，但是和上一个又有所不同，

注意后面是 `destroy(__new_start, __new_finish)`， 

看起来如果第一步copy出错的话会删除很多，我一开始也以为是个bug，但是其实不是，如果copy出错，则会直接跳到catch位置，这时候其实new_finish等于new_start， 是空的序列。

所以这个时候的__new_finish就类似不嵌套的时候的cur的作用，指示目前位置。

## 嵌套使用总结

首先要保证handle函数内是可以完全销毁并继续上抛异常的。

### 分两步

首先处理第一段，然后处理第二段，

- 如果第一段不正常， 则第一段内部销毁函数内处理的数据, 并且上抛的异常没有接收， 程序退出。
- 如果第一段正常， 则进入第二段，
    - 如果第二段正常，则程序正常向下运行，
    - 如果第二段异常，则第二段内部销毁函数内处理的数据, 并且上抛的异常被处理，销毁[first, mid)

```cpp
mid = handle(first);
try{
	last = handle(mid);
catch(...){
	destroy(first, mid);
}
```

### 使用位置标记

首先mid=first， 

- 第一段异常，函数内处理的数据在第一段内部销毁，上抛的异常被处理, 此时mid=first， 销毁[first, first)， 不进行操作。
- 第一段处理正常， 继续向下
    - 第二段处理正常，程序正常向下运行。
    - 第二段处理异常，第二段内部销毁函数内处理的数据, 上抛的异常被处理， 销毁[first, mid)

```cpp
mid = first;
try{
	mid = handle(first);
	last = handle(mid);
catch(...){
	destory(first, mid);
}
```