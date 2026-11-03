---
title: YakSSA 函数、方法和闭包
date: '2023-12-01T03:07:05.000Z'
permalink: /writing/yakssa-functions/
categories:
  - 程序分析
tags:
  - 程序分析
  - 技术文章
source: 'https://feishu-4dogs.feishu.cn/wiki/ADoKwcsUQi0v0zkmD7QcbnUPn8d'
sourceName: 飞书源文档
sourceCreatedAt: '2023-12-01T03:07:05.000Z'
sourceUpdatedAt: '2023-12-04T09:39:01.000Z'
dateBasis: source-created
originalPublishedAt: null
publicationDateVerified: false
publicationStatus: author-confirmed
importedAt: '2026-10-30'
---
# 函数

## ssa定义

这里只展示了和Function相关的区域。

```Go
type Function struct {
        anInstruction
        anValue

        // just function parameter and all return instruction
        Param  []*Parameter
        Return []*Return

        // BasicBlock list
        Blocks []*BasicBlock
        // First and End block
        EnterBlock *BasicBlock
        ExitBlock  *BasicBlock
        // For Defer  semantic
        // this block will always execute when the function exits,
        // regardless of whether the function returns normally or exits due to a panic.
        DeferBlock *BasicBlock
}
```

## 定义函数

在yaklang中，当用户开始直接编写代码的时候

从ast遍历生成ssa， 当定义一个函数的时候，将会直接创建一个新的函数，并保存为当前函数的子函数。

## 导入函数

如果是外部标准库函数，相关的解析都在`ssa/extern_instance.go`文件中，

```Go

func (b *FunctionBuilder) BuildValueFromAny(id string, v any) (value Value) {
        if value, ok := b.externInstance[id]; ok {
                return value
        }

        itype := reflect.TypeOf(v)
        if itype == nil {
                return nil
        }

        if strings.HasPrefix(id, "$") || strings.HasPrefix(id, "_") {
                return nil
        }

        str := id
        switch itype.Kind() {
        case reflect.Func:
                f := NewFunctionWithType(str, b.CoverReflectFunctionType(itype, 0))
                f.SetPosition(b.CurrentPos)
                value = f
        default:
                value = NewParam(str, false, b.Function)
                value.SetType(b.handlerType(itype, 0))
        }
        value.SetExtern(true)
        b.externInstance[str] = value
        return
}

func (f *FunctionBuilder) CoverReflectFunctionType(itype reflect.Type, level int) *FunctionType {
        params := make([]Type, 0)
        returns := make([]Type, 0)
        isVariadic := itype.IsVariadic()
        // parameter
        for i := 0; i < itype.NumIn(); i++ {
                params = append(params, f.handlerType(itype.In(i), level))
        }
        // return
        for i := 0; i < itype.NumOut(); i++ {
                returns = append(returns, f.handlerType(itype.Out(i), level))
        }
        return NewFunctionTypeDefine(itype.String(), params, returns, isVariadic)
}
```



# 闭包 

yak中直接编写的代码都被认为是main函数，而其他定义的函数都被认为是main函数的子函数，其中全局变量的概念其实被认为是main函数内的变量在子函数内被捕获。

所以任何一个函数都被认为是闭包函数。在SSA构建的初期就考虑过闭包将要如何表达的问题。

## 参考

#### LLVM

在LLVM中主要看了支持的C++的lambda，也可以捕获变量，但是LLVM是比较底层的IR实现，在LLVM中并没有对闭包进行任何支持，所有的lambda在AST层面会被完全降级到普通函数。

#### GoSSA

Golang也对闭包进行了支持。通过函数定义`FreeValue`概念，然后在调用时`make closure`进行变量捕获： 

```Go
package main

func main() {
        a := 0
        b := 1
        f := func(){
                a = 2
                println(b)
        }
        println(a)
        f()
        println(a)
        _ = a
}
```



```Plain Text
  func  main       func()
# Name: main.main
# Package: main
# Location: /Users/wlz/Developer/Project/tools/go/ssa/input.go:4:6
func main():
0:                                                                entry P:0 S:0
        t0 = new int (a)                                                   *int
        *t0 = 0:int
        t1 = new int (b)                                                   *int
        *t1 = 1:int
        t2 = make closure main$1 [t0, t1]                                func()
        t3 = *t0                                                            int
        t4 = println(t3)                                                     ()
        t5 = t2()                                                            ()
        t6 = *t0                                                            int
        t7 = println(t6)                                                     ()
        t8 = *t0                                                            int
        return

# Name: main.main$1
# Package: main
# Location: /Users/wlz/Developer/Project/tools/go/ssa/input.go:7:7
# Parent: main
# Free variables:
#   0:  a *int
#   1:  b *int
func main$1():
0:                                                                entry P:0 S:0
        *a = 2:int
        t0 = *b                                                             int
        t1 = println(t0)                                                     ()
        return

```



## 设计 

在YakSSA中，最开始也是参考的GolangSSA的格式，定义了FreeValue， 并且区分其类型：

```Go
type Function struct {
        // if this function is anonFunc
        FreeValues   []Value   // the value, captured variable form parent-function,
        symbolObject *Make     // for function symbol table
}
```

这是作为闭包函数的时候function使用的部分，主要是FreeValue和Symbol，

外部捕获的变量将会有两种情况： 

- 作为左值赋值，也就是在闭包函数内部被修改。这时候freevalue将会是上层函数符号表中获取该值：`feild parentFunc.Symbol [name]`， 同时在函数调用结束以后，也会重新将数据设置为
- 作为右值使用， 这时候freevalue将会设置为`Parameter`，也就是将其认为是一个额外的、隐式传递的参数，在函数调用的时候尝试分析是否存在足够的参数，包括显示声明的参数以及隐式外部捕获作为右值的参数。

假如存在一下的yak代码：

```Go
a = 0
b = 1
f = () => {
        a = 2
        println(b)
}
println(a)
f()
println(a)
```

将会产生以下SSA代码：

```Plain Text
yak-main
pos:   1:0   -  11:0  :
type: ( ) -> null
entry-0: (true)
        <any> t2 = undefined-println
        <any> t3 = call <any> t2 (<number> 0) []
        <null> t4 = call <( ) -> null> yak-main$1 () [<number> 0, <any> t2, <number> 1]
        <any> t6 = <any>  field[<string> a]
        <any> t5 = call <any> t2 (<any> t6) []

extern type:
extern Value:
yak-main$1
parent: yak-main
pos:   4:5   -   7:2  : ()=>{
freeValue: <string> a(modify), <any> println, <any> b
type: ( ) -> null
entry-0: (true)
        update [<string> a(modify)] = <number> 2
        <any> t3 = call <any> println (<any> b) []
```

### 面临的问题

该设计将会面临一些问题： 

**问题1: 数据的左值和右值难以区分。**

因为左值和右值是全部保存在`map[string]value`， 在map中如果存在右值则会强制将map中的value设置为field， 因此假如同一个函数同时作为左值和右值出现，是无法区分的。

```Go
a = 0
f = () => {
        a = 2
        println(a)
}
```

如上所示的代码中，a同时作为左值和右值被使用。

但是左值和右值的检测方案应该是不同的：

- 假如在闭包内捕获的数据被当作右值使用，那么在闭包函数调用的时候他必须存在。
- 假如在闭包内捕获的数据被当作左值使用，那么在闭包函数调用的时候存在不存在都可以，假如存在则会修改外部的数据，假如不存在则相当于不存在这个数据。

**问题2： 数据流关系不连续**

更新外部数据是通过 `<any> t6 = <any>  field[<string> a]`进行表达的，和闭包函数的调用没有直接的数据流关系。



## 重构

对于上述的两个问题，提出另一套思路管理闭包。

闭包函数存在两种属性：

- 使用的右值是捕获的外部变量，在函数调用时必须存在，相当于是隐式的参数。
- 使用的左值是对外部数据的修改，应该是副作用。

于是重构如下：

- 区分左值右值，拆分为两个位置保存数据： `FreeValue`和`SideEffect`。
- 实现新的指令： `SideEffect`

```Go

type SideEffect struct {
        anInstruction
        anValue
        target Value // call instruction
}

var (
        _ Node        = (*SideEffect)(nil)
        _ Value       = (*SideEffect)(nil)
        _ User        = (*SideEffect)(nil)
        _ Instruction = (*SideEffect)(nil)
)

```

仍然是这段代码：

```Go
a = 0
b = 1
f = () => {
        a = 2
        println(b)
}
println(a) //print(0)
f()// a = sideEffect
println(a)// print(0) => print(a)
```

得到的SSA：

```Go
yak-main
pos:   1:0   -  11:0  :
type: ( ) -> null
entry-0: (true)
        <any> t2 = undefined-println
        <any> t3 = call <any> t2 (<number> 0) []
        <null> t4 = call <( ) -> null> yak-main$1 () [<any> t2, <number> 1]
        <any> t6 = side-effect <null> t4 [a]
        <any> t5 = call <any> t2 (<any> t6) []

extern type:
extern Value:
yak-main$1
parent: yak-main
pos:   4:5   -   7:2  : ()=>{
freeValue: <any> println, <any> b
sideEffects: a
type: ( ) -> null
entry-0: (true)
        <any> t1 = call <any> println (<any> b) []
```

# 方法

## 类型方法的定义

在SSA的类型中，每个类型都需要实现创建方法、增加方法、获取方法。方法是一个函数。

```Go
type Type interface {
        String() string
        RawString() string
        GetTypeKind() TypeKind

        // set/get method
        SetMethod(map[string]*FunctionType)
        AddMethod(string, *FunctionType)
        GetMethod() map[string]*FunctionType
        // GetAllKey() []string
}
```



## 外部方法的自动解析

对于外部变量，将会在创建的时候从golang的反射获取该类型和其指针类型的方法。

```Go
        var ret Type
        // handler method
        pTyp := reflect.PointerTo(typ)
        Methods := make(map[string]*FunctionType, typ.NumMethod()+pTyp.NumMethod())
        handlerMethod := func(typ reflect.Type) {
                for i := 0; i < typ.NumMethod(); i++ {
                        method := typ.Method(i)
                        funTyp := f.CoverReflectFunctionType(method.Type, level)
                        if isInterface {
                                funTyp.Parameter = utils.InsertSliceItem(funTyp.Parameter, ret, 0)
                        }
                        funTyp.SetName(method.Name)
                        Methods[method.Name] = funTyp
                }
        }
        handlerMethod(typ)
        handlerMethod(pTyp)
        ret.SetMethod(Methods)
```



## 类型方法的回调

在ssa的type中会有以下定义， 在获取类型方法的时候，首先在类型内置的方法中构建，如果不能成功则尝试通过`ExternMethodBuilder`进行构建。在ssaapi中提供了Option用于注册一个builder。

```Go
/// ssa/type.go
type MethodBuilder interface {
        Build(Type, string) *FunctionType
        GetMethodNames(Type) []string
}

var ExternMethodBuilder MethodBuilder

func GetMethod(t Type, id string) *FunctionType {
        var f *FunctionType
        if fun, ok := t.GetMethod()[id]; ok {
                f = fun
        }

        if f == nil && ExternMethodBuilder != nil {
                f = ExternMethodBuilder.Build(t, id)
                if f != nil {
                        t.AddMethod(id, f)
                }
        }
        if f != nil {
                f.IsMethod = true
        }
        return f
}

/// ssaapi:

func WithExternMethod(b ssa.MethodBuilder) Option {
        return func(c *config) {
                c.externMethod = b
        }
}

```

以下是一个代码示例，是yak内置方法的注册， 代码位于`plugin_type_analyzer/rules/yak_ssaapi_options.go`, 根据传入的类型动态生成类型，可以实现一些类似模板类型的效果。

```Go
type Builder struct{}

var _ (ssa.MethodBuilder) = (*Builder)(nil)

func (b *Builder) Build(t ssa.Type, s string) *ssa.FunctionType {
        var (
                arg          = []ssa.Type{t}
                ret          = []ssa.Type{}
                IsVariadic   = false
                IsModifySelf = false
                name         = ""
        )

        var (
                StrTyp      = ssa.BasicTypes[ssa.String]
                NumberTyp   = ssa.BasicTypes[ssa.Number]
                BoolTyp     = ssa.BasicTypes[ssa.Boolean]
                AnyTyp      = ssa.BasicTypes[ssa.Any]
                BytesTyp    = ssa.BasicTypes[ssa.Bytes]
                HandlerFunc = func(arg, ret []ssa.Type, isVar bool) ssa.Type {
                        return ssa.NewFunctionTypeDefine("handler", arg, ret, isVar)
                }
                SliceTyp = func(t ssa.Type) ssa.Type {
                        return ssa.NewSliceType(t)
                }
                MapTyp = func(k ssa.Type, v ssa.Type) ssa.Type {
                        return ssa.NewMapType(k, v)
                }
        )

        switch t.GetTypeKind() {
        case ssa.MapTypeKind:
                ot, _ := ssa.ToObjectType(t)
                fieldTyp := ot.FieldType
                keyTyp := ot.KeyTyp
                name += "map." + s
                switch s {
                case "Keys":
                        ret = append(ret, SliceTyp(keyTyp))
                case "Values":
                        ret = append(ret, SliceTyp(fieldTyp))
                case "Entries", "Item":
                        // TODO: handle this return type: the map[T]U return [][1:T, 2:U]
                        ret = append(ret, SliceTyp(AnyTyp))
                case "ForEach":
                        arg = append(arg, HandlerFunc([]ssa.Type{keyTyp, fieldTyp}, []ssa.Type{}, false))
                case "Set":
                        IsModifySelf = true
                        arg = append(arg, keyTyp, fieldTyp)
                        // TODO: this return value always True
                        ret = append(ret, BoolTyp)
                case "Remove", "Delete":
                        IsModifySelf = true
                        arg = append(arg, keyTyp)
                case "Has", "IsExisted":
                        arg = append(arg, keyTyp)
                        ret = append(ret, BoolTyp)
                case "Length", "Len":
                        ret = append(ret, NumberTyp)
                default:
                        name = ""
                }
                .....
              
```



## 自修改函数

可以注意的是某些方法和闭包一样会出现自修改的特性。一个最简单的例子就是`a = []; a.Push(1)`。

在最初的思路中，希望将这样的代码转换为类似golang的处理： `a = slice.Push(a, 1)`。

后面发现其实很多方法本身是存在返回值的，比如：`map.Set(*Map, key, value) bool`

假如有以下代码：

```Go
a = {}
b = a.Set("a", 1) 
println(b)
println(a)
```

这样的情况就不能简单粗暴的认为`a = a.Set("a", 1)`。

解决方法就是：`SideEffect`, 认为函数定义如下：`map.Set(Map, key, value) bool / FreeValue[] / SideEffect[Map]` 

```Go
t0 = make({}, 0) 
t1 = call map.Set (t0, "a", 1)
t2 = sideEffect t1 ["a"]
t3 = call println t1
t4 = call println t2
```

# SideEffect: 数据流修正

如果出现了SideEffect，则需要处理一些特殊情况：

> 在SSA中，所有的数据在第二趟类型推导和检查之后才会确定类型，那么所有的函数类型都是需要在第二趟确定，SideEffect也在这时候被插入到SSA中，这时候所有的数据和指令都已经保存好，需要做的事情是：将SideEffect插入到Call指令之后，然后替换从这个点往后的所有原本的指令。

在闭包函数的处理中这一部分代码如下：

```Go

func (c *Call) HandleFreeValue(fvs []string, sideEffect []string) {
        builder := c.GetFunc().builder
        recoverBuilder := builder.SetCurrent(c)
        defer recoverBuilder()
        
        // check freevalue exist? 
        for _, name := range fvs {
                // get current function variable for call this closure
                v := builder.ReadVariableBefore(name, false, c)
                // if not get, try build freeValue in parent function.
                if v == nil && builder.CanBuildFreeValue(name) {
                        v = builder.BuildFreeValue(name)
                }
                if v != nil {
                        c.binding = append(c.binding, v)
                } else {
                        c.NewError(Error, SSATAG, BindingNotFound(name))
                }
        }
        
        
        // check SideEffect exist 
        for _, name := range sideEffect {
                v := builder.ReadVariableBefore(name, false, c)
                if v == nil {
                        // if side effect not found, just skip
                        continue
                }
                // handle side effect
                // new SideEffect instruction 
                sideEffect := NewSideEffect(name, c)
                builder.EmitInstructionAfter(sideEffect, c)
                sideEffect.SetPosition(c.GetPosition())
                sideEffect.SetType(BasicTypes[Any])
                // write to symbol in current block 
                builder.WriteVariable(name, sideEffect)
                // replace origion instruction to Insert-Instruction, after Insert-Position 
                // in this, insert-instruction is sideEffect , origion instruction is v 
                InsertValueReplaceOriginal(v, sideEffect)
        }

}
```

主要的代码在 [pr629](https://github.com/yaklang/yaklang/pull/629/commits) 中实现的`InsertValueReplaceOriginal`函数。

## 基础

在开始之前，需要先介绍一下目前已有的指令替换方法：

```Go
func ReplaceValue(v Value, to Value, skip func(Instruction) bool) {
        deleteInst := make([]User, 0)
        for _, user := range v.GetUsers() {
                if skip(user) {
                        continue
                }
                user.ReplaceValue(v, to)
                to.AddUser(user)
                deleteInst = append(deleteInst, user)
        }
        for _, user := range deleteInst {
                v.RemoveUser(user)
        }
}

```

该函数表达将`v`替换为`to`， 将所有的v的user全部转换给to，并将这些user从v中删除。

同时提供回调函数用于判断是否跳过某个user。

## 单个基本快

对于普通的不存在多分枝的情况比较简单, 比如以下情况：

```Go
a = "first line"
a.join("second line")
println(a)
a = "xxx" 
```

插入代码的位置简单表示为箭头，在插入位置之前的不需要替换，为原本的a，表示为绿色，在插入位置之后的需要替换为`SideEffect`，表示为蓝色。



![YakSSA 函数、方法和闭包：原文结构图](/media/articles/375e99402c0205d5.webp)



这段代码比较简单，直接判断所有的使用者和insert的Position即可。

可以通过这样的代码解决:

```Go
        block := insert.GetBlock()
        fun := block.GetFunc()
        builder := fun.builder
        // builder := block.GetFunc().builder
        variable := original.GetVariable()

        deleteInst := make([]Instruction, 0)

        // replace variable in block
        replaceInBlock := func(v, to Value, block *BasicBlock, skip func(Instruction) bool) {
                ReplaceValue(v, to, func(i Instruction) bool {
                        return i.GetBlock() != block || skip(i)
                })
        }

        afterInsert := func(inst Instruction) bool {
                if inst.GetPosition() == nil {
                        return true
                }
                if inst.GetPosition().StartLine > insert.GetPosition().StartLine {
                        return false
                } else {
                        return true
                }
        }
        
        // replace variable in insert block after insert instruction position
        replaceInBlock(original, insert, block, afterInsert)
        // if this block current end variable is original, replace. !!! [if not, skip] !!!
        if builder.readVariableByBlock(variable, block, false) == original {
                builder.writeVariableByBlock(variable, insert, block)
        }
```

首先封装了一下替换函数，然后替换在当前基本块， 位于insert后的所有original的数据。

ssa代码如下：

```Go
yak-main
pos:   1:0   -   5:0  :
type: ( ) -> null
entry-0: (true)  3:1   -   4:11 :
                <any> t5 = undefined-println                                                                                 4:1   -   4:8  : println
                <string> t4 = call <string.join> string.join (<string> first line, <string> second line) []                  3:1   -   3:22 : a.join("second line")
                <any> t6 = call <any> t5 (<string> t4) []                                                                    4:1   -   4:11 : println(a)
```

## 分支结构

对于存在分支判断的结构， 将会有以下的情况：

```Go
a = "first line" 
if b == 1 {
        a.join("second line")
}
println(a)
```

如果是该位置在分支的开头，则后续的全部替换即可，但是如果是在分支的中间，将会产生Phi指令。



![YakSSA 函数、方法和闭包：原文结构图](/media/articles/df47c8f998d9f8b7.webp)



Phi指令的创建是基于以下策略的：

- 当尝试从某个基本块获取某个数据的时候，如果当前基本块不存在该值，将会向上查找，如果前序基本块只有一个则递归，如果前序基本块有多个将会创建Phi并合并所有前序基本块中的数据。

对于这种情况，采用以下策略：

首先获取该基本块原本的`a`对应的值是什么，然后在当前基本块删除这个`a`的定义，尝试重新创建，则会向上查找并聚合形成Phi。

如果数据和原本的不同了，则在当前基本块替换，而且如果数据没有user，则可以直接删除。

```Go
        handlerSuccBlock := func(item *BasicBlock) (Value, Value) {
                old := builder.readVariableByBlock(variable, item, false)
                builder.deleteVariableByBlock(variable, item)
                new := builder.readVariableByBlock(variable, item, false)
                if old != new {
                        replaceInBlock(old, new, item, func(i Instruction) bool {
                                return i == new
                        })
                }
                if len(old.GetUsers()) == 0 {
                        deleteInst = append(deleteInst, old)
                }
                return old, new
        }
        
```

然后开始从当前基本块开始，向后遍历所有基本块，并且执行`handlerSuccBlock`策略。

如果数据没有被修改，并且前序基本块之后当前基本块，则后续都不会在变化，直接跳出循环。

```Go
        for i := block.Index + 1; i < len(fun.Blocks); i++ {
                item := fun.Blocks[i]
                old, new := handlerSuccBlock(item)
                if old == new {
                        // if not change
                        flag := true
                        // and all succ block of this block only one prev block
                        lo.ForEach(item.Succs, func(item *BasicBlock, index int) {
                                if len(item.Preds) > 1 {
                                        flag = false
                                }
                        })
                        // end loop
                        if flag {
                                break
                        }
                }
        }
```

SSA的指令如下：

```Go
yak-main
pos:   1:0   -   7:0  :
type: ( ) -> null
entry-0: (true)  3:4   -   6:8  :
                <any> t1 = undefined-b                                                   3:4   -   3:5  : b
                <boolean> t3 = <any> t1 eq <number> 1                                    3:4   -   3:10 : b==1
                <any> t10 = undefined-println                                            6:1   -   6:8  : println
                <any> t12 = not <boolean> t3
                If [<boolean> t3] true -> if.true-1, false -> if.done-2                  3:1   -   5:2  : ifb==1{
if.true-1: <- entry-0  (t3)  3:11  -   5:2  : {
                <string> t8 = call <string.join> string.join (<string> first line, <string> second line) []                  4:2   -   4:23 : a.join("second line")
                jump -> if.done-2                                                                                            3:1   -   5:2  : ifb==1{
if.done-2: <- if.true-1 entry-0  (true)  6:1   -   6:11 :
                <any> t13 = phi [<string> t8, if.true-1] [<string> first line, entry-0]
                <any> t11 = call <any> t10 (<any> t13) []                                                 6:1   -   6:11 : println(a)

```



## 循环结构

当出现循环时，情况又有一些不一样。

```Go
a = "first line" 
for a.Contain(b) {
    a.join("second line")//call(a, "se")
    a.join("third line")
}
println(a)
```

在这时，我们提出一个思路： 

- 修改cfg的构建，使得所有的基本块在列表中排序是按照依赖图排序的，直接通过基本块的索引向后遍历，就本身处于数据以来顺序的路径上。
- 当出现循环时，直接通过`item.IsBlock(LoopLatch)`判断是否时循环的回跳。



![YakSSA 函数、方法和闭包：原文结构图](/media/articles/bd3e39bd26d4db41.webp)



按照这样的思路。对于循环内部的所有数据直接和普通分支结构一样遍历即可。直到运行到`LoopLatch`。

```Go
        var loopHeader *BasicBlock
        for i := block.Index + 1; i < len(fun.Blocks); i++ {
                item := fun.Blocks[i]
                old, new := handlerSuccBlock(item)
                if old == new {
                        // if not change
                        flag := true
                        // and all succ block of this block only one prev block
                        lo.ForEach(item.Succs, func(item *BasicBlock, index int) {
                                if len(item.Preds) > 1 {
                                        flag = false
                                }
                        })
                        // end loop
                        if flag {
                                break
                        }
                }

                if item.IsBlock(LoopLatch) {
                        loopHeader = item.Succs[0]
                        break
                }
        }

```

而对于循环的最后处理， 思路如下：

循环头应该重新构建Phi，如果不同的话向后替换，

- 跳过所有循环内的指令，因为已经替换过一次了。
- 在插入指令的基本块内，只能替换插入点之前的。

其实就是去掉所有已经替换过的数据。

```Go
        if loopHeader != nil {
                old, new := handlerSuccBlock(loopHeader)
                if old != new {
                        // replace variable loopCfG outside,  and must after loop enter block
                        ReplaceValue(old, new, func(i Instruction) bool {
                                if i == new {
                                        return true
                                }
                                if i.GetBlock().Index <= loopHeader.Index {
                                        return true
                                }
                                if i.GetBlock() == block {
                                        return !afterInsert(i)
                                }
                                return false
                        })
                }
        }
```

最后生成的SSA代码如下：

```Go
yak-main
pos:   1:0   -   7:0  :
type: ( ) -> null
entry-0: (true)  3:1   -   6:8  :
                <any> t13 = undefined-list                     3:1   -   5:2  : foriteminlist{
                <any> t14 = undefined-println                  6:1   -   6:8  : println
                jump -> loop.header-1                          3:1   -   5:2  : foriteminlist{
loop.header-1: <- entry-0 loop.latch-3  (true)  3:1   -   5:2  :
                <any> t17 = phi [<string> first line, entry-0] [<string> t10, loop.latch-3]
                <struct {boolean,any,any}> t2 = next[<any> t13]                                               3:1   -   5:2  : foriteminlist{
                <any> t3 = <struct {boolean,any,any}> t2 field[<string> key]                                  3:1   -   5:2  : foriteminlist{
                <any> t4 = <struct {boolean,any,any}> t2 field[<string> field]                                3:1   -   5:2  : foriteminlist{
                <boolean> t5 = <struct {boolean,any,any}> t2 field[<string> ok]                               3:1   -   5:2  : foriteminlist{
                <any> t16 = not <boolean> t5
                Loop [<nil>; <boolean> t5; <nil>] body -> loop.body-2, exit -> loop.exit-4                    3:1   -   5:2  : foriteminlist{
loop.body-2: <- loop.header-1  (t5)  3:18  -   5:2  : {
                <string> t10 = call <string.join> string.join (<any> t17, <string> second line) []                  4:2   -   4:23 : a.join("second line")
                jump -> loop.latch-3                                                                                3:1   -   5:2  : foriteminlist{
loop.latch-3: <- loop.body-2  (t5)
                jump -> loop.header-1                  3:1   -   5:2  : foriteminlist{
loop.exit-4: <- loop.header-1  (t16)  6:1   -   6:11 :
                <any> t15 = call <any> t14 (<any> t17) []                  6:1   -   6:11 : println(a)

```
