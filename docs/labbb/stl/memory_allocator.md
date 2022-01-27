---
title: memory_allocator
date: 2022-01-27 00:59:06
permalink: /pages/0d997c/
categories:
  - labbb
  - stl
tags:
  - 
---
# memory allocator

## Overview

相关定义在文件 `stl_alloc.h` .

这个文件定义了一下几个分配器：

```cpp
template <int __inst> class __malloc_alloc_template;
template <bool threads, int inst> class __default_alloc_template ;

template <class _Alloc> class debug_alloc ;
template<class _Tp, class _Alloc> class simple_alloc;
template <class _Tp> class allocator ;
template <class _Tp, class _Alloc> struct __allocator ;

typedef __default_alloc_template<__NODE_ALLOCATOR_THREADS, 0> alloc;
typedef __default_alloc_template<false, 0> single_client_alloc;
```

 `__malloc_alloc_template` and `__default_alloc_template`, 实现了对应的分配器功能。

`debug_alloc`, `simple_alloc`, `allocator`, `__allocator`, 其实只是一层对其他分配器的封装，提供了不同的接口，但是内存分配功能来自于传入的模板参数 `_Alloc`。

`alloc`, `single_client_alloc`两个类是typedef， 但是由于对应的类中全都是静态函数，所以可以直接通过这两个进行访问。

## allocator

专门实现分配功能的类， `__malloc_alloc_template` and `__default_alloc_template`.

### one-stage allocator `__malloc_alloc_template`

`__malloc_alloc_template`, 只是简单的封装。

```cpp
template <int __inst>
class __malloc_alloc_template {

private:
  static void* _S_oom_malloc(size_t);
  static void* _S_oom_realloc(void*, size_t);
#ifndef __STL_STATIC_TEMPLATE_MEMBER_BUG
  static void (* __malloc_alloc_oom_handler)();
#endif

public:
  static void* allocate(size_t __n)
  static void deallocate(void* __p, size_t /* __n */)
  static void* reallocate(void* __p, size_t /* old_sz */, size_t __new_sz)
  static void (* __set_malloc_handler(void (*__f)()))()
};

// malloc_alloc out-of-memory handling
#ifndef __STL_STATIC_TEMPLATE_MEMBER_BUG
template <int __inst>
void (* __malloc_alloc_template<__inst>::__malloc_alloc_oom_handler)() = 0;
#endif
```

 可以看到定义比较简单，allocate\deallocate\reallocate函数都是简单封装了一层malloc\free\realloc， 

值得注意的是 `__malloc_alloc_oom_handler`， 这个是为了模仿cpp本身的new handler机制，

> 在new获取内存失败并尝试丢出异常之前，会尝试调用 `new_handler` 函数， ，尝试处理内存不足的情况
> 

于是这里提供了 set_malloc_handler函数用于设置 `__malloc_alloc_oom_handler`，然后在allocate\reallocate函数获取内存失败时会调用 `_S_oom_malloc\_S_oom_realloc`,其中会不断尝试调用 `__malloc_alloc_oom_handler` 函数。

### two-stage allocator `__default_alloc_template`

二级分配器就是 `__default_alloc_template` 

先简述思路，对于 `_MAX_BYTES` 大小以下的数据使用内存池进行内存分配, 以上的直接使用malloc\free。

使用链表 free_list串连空闲状态的chunk， 并按照大小排开，共16个，从0x8 — 0x80, 

并且每个按照0x8分隔，对于小内存就从这个里面取。

当链表为空的时候会尝试填充链表，这时候牵扯到 `_S_start_free` 和 `_S_end_free` 两个指针，指向现在空闲的内存池，每次内存池容量不够时会调用malloc进行扩充，而且扩充内存设置为需要内存的两倍，于是多余的可以增长内存池容量。

```cpp
template <bool threads, int inst>
class __default_alloc_template {

private:
  // Really we should use static const int x = N
  // instead of enum { x = N }, but few compilers accept the former.
#if ! (defined(__SUNPRO_CC) || defined(__GNUC__))
    enum {_ALIGN = 8};
    enum {_MAX_BYTES = 128};
    enum {_NFREELISTS = 16}; // _MAX_BYTES/_ALIGN
# endif
  static size_t
  _S_round_up(size_t __bytes) 
    { return (((__bytes) + (size_t) _ALIGN-1) & ~((size_t) _ALIGN - 1)); }

__PRIVATE:
  union _Obj {
        union _Obj* _M_free_list_link;
        char _M_client_data[1];    /* The client sees this.        */
  };
private:
# if defined(__SUNPRO_CC) || defined(__GNUC__) || defined(__HP_aCC)
    static _Obj* __STL_VOLATILE _S_free_list[]; 
        // Specifying a size results in duplicate def for 4.1
# else
    static _Obj* __STL_VOLATILE _S_free_list[_NFREELISTS]; 
# endif
  static  size_t _S_freelist_index(size_t __bytes) {
        return (((__bytes) + (size_t)_ALIGN-1)/(size_t)_ALIGN - 1);
  }

  static void* _S_refill(size_t __n);
  static char* _S_chunk_alloc(size_t __size, int& __nobjs);

  // Chunk allocation state.
  static char* _S_start_free;
  static char* _S_end_free;
  static size_t _S_heap_size;

# ifdef __STL_THREADS
    static _STL_mutex_lock _S_node_allocator_lock;
# endif

    class _Lock;
    friend class _Lock;
    class _Lock {
        public:
            _Lock() { __NODE_ALLOCATOR_LOCK; }
            ~_Lock() { __NODE_ALLOCATOR_UNLOCK; }
    };

public:

  /* __n must be > 0      */
  static void* allocate(size_t __n) {}
  /* __p may not be 0 */
  static void deallocate(void* __p, size_t __n) {}
  static void* reallocate(void* __p, size_t __old_sz, size_t __new_sz);
} ;
```

#### 内存池分配

在allocate函数中，进行判断，根据内存需求的大小来看是否使用内存池，

```cpp
/* __n must be > 0      */
  static void* allocate(size_t __n)
  {
    void* __ret = 0;

    if (__n > (size_t) _MAX_BYTES) {
      __ret = malloc_alloc::allocate(__n);
    }
    else {
      _Obj* __STL_VOLATILE* __my_free_list
          = _S_free_list + _S_freelist_index(__n);
      // Acquire the lock here with a constructor call.
      // This ensures that it is released in exit or during stack
      // unwinding.
#     ifndef _NOTHREADS
      /*REFERENCED*/
      _Lock __lock_instance;
#     endif
      _Obj* __RESTRICT __result = *__my_free_list;
      if (__result == 0)
        __ret = _S_refill(_S_round_up(__n));
      else {
        *__my_free_list = __result -> _M_free_list_link;
        __ret = __result;
      }
    }

    return __ret;
  };
```

可以看到， 大于 `_MAX_BYTES` 时会直接使用malloc函数。

小于时使用内存池，

`_S_free_list` 是一个数组，通过 `_S_freelist_index(**n)`获取对应的索引值，并得到对应的链表 `__my_free_list` 。**

然后判断其中是否有数据，有的话链表首项脱链并返回，没有的话调用函数 `_S-refill` 进行链表填充， `_S_round_up(__n)` 是向8的倍数向上对齐。

在看deallocate函数，

```cpp
static void deallocate(void* __p, size_t __n)
  {
    if (__n > (size_t) _MAX_BYTES)
      malloc_alloc::deallocate(__p, __n);
    else {
      _Obj* __STL_VOLATILE*  __my_free_list
          = _S_free_list + _S_freelist_index(__n);
      _Obj* __q = (_Obj*)__p;

      // acquire lock
#       ifndef _NOTHREADS
      /*REFERENCED*/
      _Lock __lock_instance;
#       endif /* _NOTHREADS */
      __q -> _M_free_list_link = *__my_free_list;
      *__my_free_list = __q;
      // lock is released here
    }
  }
```

要么使用free函数，要么直接放入到内存池中。

#### 内存池拓展

下面看下内存拓展相关的部分。

首先的内存池拓展接口是 `_S_refill` ， 直接使用 `_S_chunk_alloc` 分配对应的堆块 **nobjs个，默认是20，但是内存不够时可在分配时修改这个 `__nobjs` 的大小，**

然后比较如果只分配了一个，那么正好返回回去，如果比一个大，那么开头的一个返回回去，剩下的加入到对应的 `_S_free_list` 中。

```cpp
/* Returns an object of size __n, and optionally adds to size __n free list.*/
/* We assume that __n is properly aligned.                                */
/* We hold the allocation lock.                                         */
template <bool __threads, int __inst>
void*
__default_alloc_template<__threads, __inst>::_S_refill(size_t __n)
{
    int __nobjs = 20;
    char* __chunk = _S_chunk_alloc(__n, __nobjs);
    _Obj* __STL_VOLATILE* __my_free_list;
    _Obj* __result;
    _Obj* __current_obj;
    _Obj* __next_obj;
    int __i;

    if (1 == __nobjs) return(__chunk);
    __my_free_list = _S_free_list + _S_freelist_index(__n);

    /* Build free list in chunk */
      __result = (_Obj*)__chunk;
      *__my_free_list = __next_obj = (_Obj*)(__chunk + __n);
      for (__i = 1; ; __i++) {
        __current_obj = __next_obj;
        __next_obj = (_Obj*)((char*)__next_obj + __n);
        if (__nobjs - 1 == __i) {
            __current_obj -> _M_free_list_link = 0;
            break;
        } else {
            __current_obj -> _M_free_list_link = __next_obj;
        }
      }
    return(__result);
}
```

那么关于 `_S_chunk_alloc`  函数。

这里就是对于内存池的空闲空间拓展的时候的代码。

> 递归的时候有点函数式编程的感觉，这个代码有点难读。
> 
- 首先，如果空闲空间足够的话，则直接分配对应 `__nobjs` 个 大小为 `__size` 的chunk，
- 如果内存不够，可以分配多少个`__size`大小的 `__nobjs` 就分配多少个，并设置 `__nobjs`
- 如果不能分配的话，剩余内存完全不足，则设置 `__bytes_to_get` ，(注意这个大小比需要的内存两倍还大)，将原本剩余的空闲内存放到链表里，调用malloc获取内存，
    - (这里有个小想法，这个剩余内存，一定是小于0x80的，因为如果他大于这个数的话，那么前面最起码可以分配出来一个内存返回，所以这个剩余内存完全可以扔到 free_list)
    - 调用成功以后设置好空闲内存，递归调用自身，这次应该内存充足直接返回。
    - 调用失败的话，
        - 会尝试将比当前size大一点的下个free_list中的chunk取出，当作内存池的剩余内存，递归调用自身，这时候最起码可以返回一个chunk
        - 如果free_list中也没chunk了，那么尝试调用第一级分配器，其实第一级分配器也是malloc，但是存在 `malloc_handler`，可能有用，或者直接抛出错误。这都是可以接受的解决。

```cpp
/* We allocate memory in large chunks in order to avoid fragmenting     */
/* the malloc heap too much.                                            */
/* We assume that size is properly aligned.                             */
/* We hold the allocation lock.                                         */
template <bool __threads, int __inst>
char*
__default_alloc_template<__threads, __inst>::_S_chunk_alloc(size_t __size, 
                                                            int& __nobjs)
{
    char* __result;
    size_t __total_bytes = __size * __nobjs;
    size_t __bytes_left = _S_end_free - _S_start_free;

    if (__bytes_left >= __total_bytes) {
        __result = _S_start_free;
        _S_start_free += __total_bytes;
        return(__result);
    } else if (__bytes_left >= __size) {
        __nobjs = (int)(__bytes_left/__size);
        __total_bytes = __size * __nobjs;
        __result = _S_start_free;
        _S_start_free += __total_bytes;
        return(__result);
    } else {
        size_t __bytes_to_get = 
	  2 * __total_bytes + _S_round_up(_S_heap_size >> 4);
        // Try to make use of the left-over piece.
        if (__bytes_left > 0) {
            _Obj* __STL_VOLATILE* __my_free_list =
                        _S_free_list + _S_freelist_index(__bytes_left);

            ((_Obj*)_S_start_free) -> _M_free_list_link = *__my_free_list;
            *__my_free_list = (_Obj*)_S_start_free;
        }
        _S_start_free = (char*)malloc(__bytes_to_get);
        if (0 == _S_start_free) {
            size_t __i;
            _Obj* __STL_VOLATILE* __my_free_list;
	    _Obj* __p;
            // Try to make do with what we have.  That can't
            // hurt.  We do not try smaller requests, since that tends
            // to result in disaster on multi-process machines.
            for (__i = __size;
                 __i <= (size_t) _MAX_BYTES;
                 __i += (size_t) _ALIGN) {
                __my_free_list = _S_free_list + _S_freelist_index(__i);
                __p = *__my_free_list;
                if (0 != __p) {
                    *__my_free_list = __p -> _M_free_list_link;
                    _S_start_free = (char*)__p;
                    _S_end_free = _S_start_free + __i;
                    return(_S_chunk_alloc(__size, __nobjs));
                    // Any leftover piece will eventually make it to the
                    // right free list.
                }
            }
	    _S_end_free = 0;	// In case of exception.
            _S_start_free = (char*)malloc_alloc::allocate(__bytes_to_get);
            // This should either throw an
            // exception or remedy the situation.  Thus we assume it
            // succeeded.
        }
        _S_heap_size += __bytes_to_get;
        _S_end_free = _S_start_free + __bytes_to_get;
        return(_S_chunk_alloc(__size, __nobjs));
    }
}
```

## 分配器的封装

### simple_alloc

就是一个简单的分配器。简单封装了上层的 `_Alloc` 

```cpp
template<class _Tp, class _Alloc>
class simple_alloc {

public:
    static _Tp* allocate(size_t __n)
      { return 0 == __n ? 0 : (_Tp*) _Alloc::allocate(__n * sizeof (_Tp)); }
    static _Tp* allocate(void)
      { return (_Tp*) _Alloc::allocate(sizeof (_Tp)); }
    static void deallocate(_Tp* __p, size_t __n)
      { if (0 != __n) _Alloc::deallocate(__p, __n * sizeof (_Tp)); }
    static void deallocate(_Tp* __p)
      { _Alloc::deallocate(__p, sizeof (_Tp)); }
};
```

### debug_alloc

可以用作内存检测，将chunk的第一位用于保存 size， 并在free的时候检测。

```cpp
template <class _Alloc>
class debug_alloc {

private:

  enum {_S_extra = 8};  // Size of space used to store size.  Note
                        // that this must be large enough to preserve
                        // alignment.

public:

  static void* allocate(size_t __n)
  {
    char* __result = (char*)_Alloc::allocate(__n + (int) _S_extra);
    *(size_t*)__result = __n;
    return __result + (int) _S_extra;
  }

  static void deallocate(void* __p, size_t __n)
  {
    char* __real_p = (char*)__p - (int) _S_extra;
    assert(*(size_t*)__real_p == __n);
    _Alloc::deallocate(__real_p, __n + (int) _S_extra);
  }

  static void* reallocate(void* __p, size_t __old_sz, size_t __new_sz)
  {
    char* __real_p = (char*)__p - (int) _S_extra;
    assert(*(size_t*)__real_p == __old_sz);
    char* __result = (char*)
      _Alloc::reallocate(__real_p, __old_sz + (int) _S_extra,
                                   __new_sz + (int) _S_extra);
    *(size_t*)__result = __new_sz;
    return __result + (int) _S_extra;
  }

};
```

### allocator

这个其实是标准的 stl分配器接口，

也是简单封装了上层，但是这里使用了个 typedef， 所以是指定了分配器是 alloc，也就是第二层分配器。

```cpp
template <class _Tp>
class allocator {
  typedef alloc _Alloc;          // The underlying allocator.
public:
  typedef size_t     size_type;
  typedef ptrdiff_t  difference_type;
  typedef _Tp*       pointer;
  typedef const _Tp* const_pointer;
  typedef _Tp&       reference;
  typedef const _Tp& const_reference;
  typedef _Tp        value_type;

  template <class _Tp1> struct rebind {
    typedef allocator<_Tp1> other;
  };

  allocator() __STL_NOTHROW {}
  allocator(const allocator&) __STL_NOTHROW {}
  template <class _Tp1> allocator(const allocator<_Tp1>&) __STL_NOTHROW {}
  ~allocator() __STL_NOTHROW {}

  pointer address(reference __x) const { return &__x; }
  const_pointer address(const_reference __x) const { return &__x; }

  // __n is permitted to be 0.  The C++ standard says nothing about what
  // the return value is when __n == 0.
  _Tp* allocate(size_type __n, const void* = 0) {
    return __n != 0 ? static_cast<_Tp*>(_Alloc::allocate(__n * sizeof(_Tp))) 
                    : 0;
  }

  // __p is not permitted to be a null pointer.
  void deallocate(pointer __p, size_type __n)
    { _Alloc::deallocate(__p, __n * sizeof(_Tp)); }

  size_type max_size() const __STL_NOTHROW 
    { return size_t(-1) / sizeof(_Tp); }

  void construct(pointer __p, const _Tp& __val) { new(__p) _Tp(__val); }
  void destroy(pointer __p) { __p->~_Tp(); }
};
```

## stl标准分配器

其实就是 `allocator` 

标准分配器的要求的定义是

[std::allocator](https://en.cppreference.com/w/cpp/memory/allocator)

### 静态函数的[问题](https://www.zhihu.com/question/53085291/answer/133516400)

其实对于一个allocator来说，使用静态成员函数是最为合理的，因为本身应该如同malloc\free一样为全局变量。

但是还要考虑到stl标准中要求的，对于不同容器可以使用不同的分配实例。



我们可以在 "sgistl "中看到两个类 "allocator "和"__allocator"。

正如我们在注释中看到的。`allocator`实现了分配器的标准定义。

`__allocator`只是封装了一层`sgi-style allocator`，使其成为stl标准库中定义的分配器。

当它的模板参数`_Alloc=alloc`时也是如此。

``` cpp
// Allocator adaptor to turn an SGI-style allocator (e.g. alloc, malloc_alloc)
// into a standard-conforming allocator.   Note that this adaptor does
// *not* assume that all objects of the underlying alloc class are
// identical, nor does it assume that all of the underlying alloc's
// member functions are static member functions.  Note, also, that
// __allocator<_Tp, alloc> is essentially the same thing as allocator<_Tp>.
template <class _Tp, class _Alloc> struct __allocator {}
```

并且在`__allocator`中，没有指定分配器对应的函数是否是静态函数。就是这个点。
