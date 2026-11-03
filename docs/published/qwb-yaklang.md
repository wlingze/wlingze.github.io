---
title: '强网杯：Yaklang 题目 WP'
date: '2024-06-27T13:07:42.000Z'
permalink: /writing/qwb-yaklang/
categories:
  - CTF
tags:
  - CTF
  - 技术文章
source: 'https://feishu-4dogs.feishu.cn/wiki/QDqsweTv7i93NJkeTfwcYtNvn9f'
sourceName: 飞书源文档
sourceCreatedAt: '2024-06-27T13:07:42.000Z'
sourceUpdatedAt: '2024-07-04T03:41:45.000Z'
dateBasis: source-created
originalPublishedAt: null
publicationDateVerified: false
publicationStatus: author-confirmed
importedAt: '2026-10-30'
---
# **Yaklang题解**

题目启动需要加载编译好的二进制文件，执行要求输入flag并检查是否正确。

![图片展示了在终端执行Golang逆向相关操作的命令及结果。先是执行`./main`命令，显示帮助信息；接着执行`./main ./marshalCode`，提示输入flag并给出示例；最后执行`./main ./marshalCode`，出现警告信息，指出在`vm_exec:797`处无法找到变量`func4`，并提示未找到flag。该图片与文档中Golang逆向分析内容相关，直观呈现了逆向操作及结果。](/media/articles/2887b1d07837dc62.webp)

# **Golang逆向**

逆向题目本身，是Golang编写的二进制程序逆向，恢复Golang二进制文件的符号，检查代码发现大体逻辑是调用Yaklang项目中的YakVM部分代码执行编译好的Yaklang语言Opcode文件。在IDA中进行逆向分析，可以还原题目的代码如下：

```Go

func main() {
        if len(os.Args) < 2 {
                fmt.Println("help: ./main ./marshalCode")
                os.Exit(0)
        }
        code, err := os.ReadFile(os.Args[1])
        if err != nil {
                spew.Dump(err)
                panic("read code error")
        }
        pkg.Run(code)
}

func Run(code []byte) bool {
        ret := false
        m := yakvm.NewCodesMarshaller()
        symbolTable, codes, err := m.Unmarshal(code)
        if err != nil {
                panic("unmarshal: " + err.Error())
        }
        vm := yakvm.NewWithSymbolTable(symbolTable)
        vm.SetVar("success", func() {
                println("yes! you get it!")
                ret = true
        })
        vm.SetVar("print", func(args ...interface{}) {
                fmt.Print(args...)
        })
        vm.SetVar("dump", spew.Dump)
        vm.SetVar("append", builtin.Append)
        vm.SetVar("input", func() string {
                var input string
                n, err := fmt.Scanln(&input)
                if err != nil && n != 0 {
                        panic(err)
                }
                return input
        })
        vm.SetVar("string2int", func(str string) int {
                i, err := strconv.Atoi(str)
                if err != nil {
                        return 0
                }
                return i
        })
        vm.SetVar("len", func(a []uint8) int {
                return len(a)
        })

        vm.SetVar("close", func(i interface{}) {
                rv := reflect.ValueOf(i)
                if rv.Kind() == reflect.Chan {
                        rv.Close()
                }
        })

        vm.SetVar("func3", func(a []uint8, b []uint8) bool {
                if len(a) != len(b) {
                        return false
                }
                for i, v := range a {
                        if v != b[i] {
                                return false
                        }
                }
                return true
        })
        vm.SetVar("js", yaklib.JSOttoExports)

        err = vm.Exec(context.Background(), func(frame *yakvm.Frame) {
                frame.NormalExec(codes)
        })
        if err != nil {
                spew.Dump(err)
                panic("exec code error")
        }
        return ret
}
```

# **YakVM分析**

可以在Github找到Yaklang项目的代码,https://github.com/yaklang/yaklang， 主要使用的是*https://github.com/yaklang/yaklang/tree/main/common/yak/antlr4yak* 包里的内容, 可以直接通过源码了解题目使用的API并检查VM实现和Opcode设计。

因为yaklang原本的showOpcode其实没有处理函数和defer语句，而题目中大量使用这些函数，因此这一步骤需要手动编写Golang代码调用Yaklang项目提供的API手动完成Yaklang Opcode的解析和打印。如下：

```Go
func main() {
    bytes, err := os.ReadFile("./marshalCode")
    if err != nil {
        panic("read file error")
    }

    m := yakvm.NewCodesMarshaller()
    _, code, err := m.Unmarshal(bytes)
    if err != nil {
        panic("unmarshal error")
    }

    showOpcode(code)
}

func showOpcode(c []*yakvm.Code) {
    funs := make([]*yakvm.Function, 0)
    deferCodes := make([][]*yakvm.Code, 0)
    for i, code := range c {
        switch code.Opcode {
        case yakvm.OpDefer:
            codes := code.Op1.Value.([]*yakvm.Code)
            deferCodes = append(deferCodes, codes)
            log.Info("defer")
            fmt.Printf("%-13s %4d:%v: index:%d\n", code.RangeVerbose(), i, code.String(), len(deferCodes))
            continue
        case yakvm.OpPush:
            v, ok := code.Op1.Value.(*yakvm.Function)
            if ok {
                log.Infof("function: %s", v.GetActualName())
                funs = append(funs, v)
            }
        }
        fmt.Printf("%-13s %4d:%v\n", code.RangeVerbose(), i, code.String())
    }
    for i, v := range deferCodes {
        fmt.Printf("\n\n%s: index %d\n", "defer", i)
        showOpcode(v)
    }
    for _, v := range funs {
        fmt.Printf("\n\n%s\n", v.GetActualName())
        showOpcode(v.GetCodes())
    }
}
```

运行这段代码并得到如下所示的结构，也就是一条条的Opcode指令，并且解析出来了defer的内容和函数的内容。

# **Yaklang脚本逆向**

通过Opcode可以了解Yaklang脚本逻辑, 可以大概还原出Yaklang脚本的源代码：

将会出现以下几个难点：

- JS代码：题目中使用了js.Run运行了一段JavaScript代码，实现对于输入数据的AES加密。这部分执行的js代码将会是字符串形式，并且通过`Encrypt(Buffer.from("${data}"),Buffer.from("${key}"))`这个位置的模板字符串将yaklang内的数据传入到js代码内。可以看到Opcode如下：

![图片展示的是Yaklang脚本逆向中看到的Opcode部分代码。代码中包含对Buffer.from()函数的调用，以及一系列OP指令，如pushr、type、type-cast、add等，还有call、list等指令。其中，12:17->297:0处的指令序列尤为关键，涉及OP指令的执行顺序和数据处理。该图片与文档中对Yaklang脚本逆向的介绍相关，直观呈现了脚本中指令的运行情况，为理解脚本逻辑提供参考。](/media/articles/11be25c524f10ad8.webp)

- 函数和管道的操作：题目使用了Yaklang的语言特性 管道和异步函数， 和Golang同样的使用方案用于传输数据。

![图片展示了Yaklang脚本逆向中延迟函数的使用相关代码。其中，红框突出显示了8:OP.push指令，其参数为codes\[38\]（copy），vlen:0；以及26:OP.chan-send指令，其参数为10。这些指令与延迟函数的使用相关，保证了资源回收等操作的稳定性，打乱了加密逻辑的执行顺序，是题目中关键的代码部分，与上文提到的延迟函数在设置后不会立刻调用，而是在当前函数执行结束后执行的设计相呼应。](/media/articles/ef842f9548860a8e.webp)

- 延迟函数的使用：题目中使用了延迟函数这一函数在设置以后将不会立刻调用，而是在当前函数执行结束后执行，这一设计在Golang和Yaklang中都存在，保证了资源回收等操作的稳定性，在题目中的使用将会打乱加密逻辑的执行顺序，需要选手特别关注这一结构。

![图片展示了Yaklang脚本逆向中延迟函数的使用情况。画面中用红色框突出显示了多个延迟函数的代码段，如“defer index 0”“defer index 1”等，以及“defer func3”等。这些延迟函数在设置后不会立刻调用，而是在当前函数执行结束后执行，与文档中提到的延迟函数设计相呼应，保证了资源回收等操作的稳定性，对题目中加密逻辑执行顺序的打乱需特别关注。](/media/articles/725f103d95fa026f.webp)

- 全局变量的设置：在Yaklang脚本运行时是以来外部Golang编写的程序的，而Yaklang也提供了相当多的API用于向Yaklang脚本中注入全局函数，题目的脚本内运行的所有全局函数都是手动注入的，在Golang逆向的步骤选手将会发现，而在脚本逆向的过程中将会出现`func4`函数，此函数没有被注册，将会导致错误，并立刻尝试退出当前函数，此时会进入当前函数内设置的延迟函数中。如果不能了解全局变量和延迟函数机制，将会错误的理解脚本的执行流程而导致加密算法理解出错。

![图片展示了Yaklang脚本逆向中func4函数的指令序列。其中，347:4->347:8指令为pushid，值为func4；347:10->347:12指令为pushr，值为8；347:15->347:15指令为pushr，值为2；347:9->347:16指令为call，参数长度为2。这些指令与上文提到的func4函数未被注册导致错误退出，以及进入延迟函数中等信息相关，是理解脚本执行流程和全局变量设置等关键内容的代码示例。](/media/articles/ae604496d0ca29d1.webp)

# **加密流程**

了解正确的脚本执行流程以后，输入的数据的加密算法如下：

首先进行aes加密，key="1234567890123456"，这部分是通过js代码的运行时间的，只是看着很大的代码，但是是标准的AES。可还原得到的yaklang代码如下：

```Go
key = "1234567890123456"
func1 = func(data){
    _,v = js.Run(f`
    function checkInt(value) {
        return (parseInt(value) === value);
    }
    // ...... 此处省略大量代码
    Encrypt(Buffer.from("${data}"),Buffer.from("${key}")) // 此处使用模版字符串
`)~
    return v.Export()
}

a = func1(a)
```

然后通过管道操作对前一半的数据实现了`^0xf0`的操作，而后调用`func4`函数，该函数没有定义，将会产生崩溃并进入到延迟函数内，将会实现对后一半数据进行`^0x0f`，可b还原得到的yaklang代码如下：

```Go
func2 := () => {
    defer func{
        for i:=len(a)/2; i<len(a);i++{
            v := a[i] ^ 0x0f
            res = append(res, v)
        }
    }
    ch := func{
        ch := make(chan uint8)
        go func{
            for i, v := range a {
                if i == len(a) / 2 { 
                    break
                }
                ch <- v
            }
            close(ch)
        }
        return ch
    }
    // a[0:len(a)/2]
    for v = range ch { 
        v ^= 0xf0 
        res = append(res, v)
    }
    func4(res, a)
    for i,v = range a {
        v ^= i 
        res[i] = v
        a[i] = v
    }

}
func2() 
```

简化一下这一个异或运算的逻辑如下:

```Plain Text
for i,v := range a {
    if i < len(a)/2 {
        a[i] = v ^ 0xf0
    }else {
        a[i] = v ^ 0x0f
    }
}
```

然后程序返回上一级函数并尝试退出，调用预定义的延迟函数，改函数定义了两个延迟函数，多个延迟函数将会以先入后出的顺序执行，因此将会先执行数据运算，然后进行数据比较。

```Go

defer func{
    // second 
    recover()
    // this function in closure and native
    if func3(res, b) { 
        success()
    }else {
        print("no this not flag")
    }
}

defer func{
    // first run 
    for i, v := range res {
        res[i] = (v >> 2) | ((v << 6) & 0xff) 
    }
}

```

于是这一部分就是一段位运算：

```Plain Text
for i, v := range res {
    res[i] = (v >> 2) | ((v << 6) & 0xff) 
}
```

最后进行数据比较，可以得到比较的数据是： 

```Plain Text
[]byte{
18,181,241,119,250,73,17,13,85,6,13,148,176,42,168,54,237,146,43,171,160,130,246,248,215,81,64,107,237,75,22,4
}
```

# **解密得到flag**

通过yaklang直接在yakit运行可以得到：

```Go
flag = []byte{
18,181,241,119,250,73,17,13,85,6,13,148,176,42,168,54,237,146,43,171,160,130,246,248,215,81,64,107,237,75,22,4
}
data := make([]byte, len(flag))
// shift
for i, v := range flag {
    data[i] = (v >> 6) | ((v << 2) & 0xff)
}
// xor
for i := range data {
    if i < len(data)/2 {
        data[i] ^= 0xf0
    } else {
        data[i] ^= 0x0f
    }
}

// aes from js
data, err := codec.AESECBDecrypt([]byte("1234567890123456"), data, nil)
if err != nil {
    panic(err)
}
print(string(data))
```

得到flag: wdflag{xC7tYmwyXOIHuN3y}
