---
title: 'SyntaxFlow 使用：数据流分析'
date: '2024-08-05T07:57:25.000Z'
permalink: /writing/syntaxflow-dataflow/
categories:
  - SyntaxFlow
tags:
  - SyntaxFlow
  - 技术文章
source: 'https://feishu-4dogs.feishu.cn/wiki/YD7mwIMdDiygmGkSQZScYBMhnMh'
sourceName: 飞书源文档
sourceCreatedAt: '2024-08-05T07:57:25.000Z'
sourceUpdatedAt: '2024-08-15T08:16:49.000Z'
dateBasis: source-created
originalPublishedAt: null
publicationDateVerified: false
publicationStatus: author-confirmed
importedAt: '2026-10-30'
---
简单来说，SyntaxFlow 是支持通过“定义-使用”的值关系进行追踪的，这个技术十分有用，可以充分发挥 SSA 的技术优势，精准追踪到想要的数据流。在 SyntaxFlow 设计中：

1. `->`表示向下追踪一级使用链的节点，`-->`表示向下追踪使用链节点直到链结束。
2. `#>`表示向上追踪一级定义链的节点，`#->`表示向上追踪支配（定义）链直到链结束。
3. `{}`表示追踪设置追踪的时候的上下文或者参数。例如 `-{depth: 5}->`表示向下追踪定义链，追踪深度为5表示最多追踪5层。

# 普通数据流分析

## 样例解析

在之前的SyntaxFlow教程中，我们已经看到了非常多的代码样例进行数据流分析，这里选用其中一个：

可以看到在代码中，`Runtime.getRuntime().exec`的参数为`simpleBean.getCmd`， 而此前也存在`simple.setCmd`和`simple.setCmd2`， 通过`CmdObject`的声明可以知道，`getCmd`将会拿到`this.cmd1`，`setCmd`将会设置`this.cmd1`，因此exec的参数应该是`aTaintCase022`的参数`cmd`。

```Java
package com.sast.astbenchmark.model;

public class CmdObject {
    private String cmd1;
    private String cmd2;

    public void setCmd(String s) {
        this.cmd1 = s;
    }

    public void setCmd2(String s) {
        this.cmd2 = s;
    }

    public String getCmd() {
        return this.cmd1;
    }

    public String getCmd2() {
        return this.cmd2;
    }
}

@RestController()
public class AstTaintCase001 {
  /**
   * 字段/元素级别->对象字段->对象元素
   * case应该被检出
   */
  @PostMapping(value = "case022")
  public Map<String, Object> aTaintCase022(@RequestParam String cmd) {
      Map<String, Object> modelMap = new HashMap<>();
      try {
          CmdObject simpleBean = new CmdObject();
          simpleBean.setCmd(cmd);
          simpleBean.setCmd2("cd /");
          var sh = simpleBean.getCmd();
          var sh2 = sh;
          Runtime.getRuntime().exec(sh2);
          modelMap.put("status", "success");
      } catch (Exception e) {
          modelMap.put("status", "error");
      }
      return modelMap;
  }
}
```

## 一级定义

首先我们可以用最基础的use-def链检查一下exec的参数：

```Plain Text
Runtime.getRuntime().exec(* as $para)
$para #> as $paraDef
```

得到结果如下： 

> 注意因为函数exec会传入this参数，因此会出现`Runtime.getRuntime()` 也存在在参数中。

![图片展示了使用SyntaxFlow对代码中Runtime.getRuntime().exec参数进行一级定义分析的结果。代码审计框内显示exec参数相关代码，下方列表展示分析结果。其中，paraDef下有多项内容，如Undefined - Runtime.getRuntime在control.java:39，Undefined - simpleBean.getCmd(valid)在control.java:37等。图片与上文提到的用基础use - def链检查exec参数的内容相关，呈现了具体的分析结果。](/media/articles/feea2c52c9b0bafa.webp)

可以看到加入的`var sh2 = sh`并没有影响到分析，因为SyntaxFlow使用基于SSA格式的YakSSA HIR，在分析时只关注值的关系，多层的变量传递也只是同一个值并不会影响分析。

同时也可以看到通过`->`， 可以获取到`simpleBean.getCmd()` 的上一级引用： 函数`simpleBean.getCmd`和对象`simpleBean`(这个对象也是被当作this传入的)。

## 最顶级定义

接下来，我们将使用SyntaxFlow提供的最顶级定义查看exec的参数： 

```Plain Text
Runtime.getRuntime().exec(* as $para)
$para #-> as $paraDef
```

得到结果如下：

![图片展示了使用SyntaxFlow进行最顶级定义查看exec参数的结果。代码审计框中显示Runtime.getRuntime().exec的参数相关代码。下方展开“paraDef”，显示两项内容，“Undefined-Runtime control.java:39”和“Parameter-cmd control.java:31”。这与上文描述的从runtime.getRuntime.exec获取参数得到getCmd的调用，再通过数据流分析获取到参数cmd的过程相对应，红色箭头标注的是SyntaxFlow完成的获取getCmd调用的操作，黑色箭头标记的是获取参数cmd的数据流分析过程。](/media/articles/b15b6521b959ea4e.webp)

我们也可以看到分析过程： 

从`runtime.getRuntime.exec`获取参数得到`getCmd`的调用，这一部分都是通过SyntaxFlow完成的，标注为红色箭头，并且标记了得到该数据的操作。

然后通过数据流分析获取到参数`cmd`， 在图中使用黑色箭头标记，过程中的点可以看到检查了函数`getCmd`和调用点。

![图片展示了使用SyntaxFlow进行数据流分析的过程，以runtime.getRuntime.exec的参数分析为例。图中红色箭头标注了从runtime.getRuntime.exec获取参数得到getCmd调用的操作步骤，包括search getRuntime、call、search exec等。黑色箭头标记了通过数据流分析获取参数cmd的过程，检查了函数getCmd和调用点。图中还显示了变量如t67、s、#30.cmd1等与cmd的关系，以及CmdObject_getCmd等函数在分析过程中的关联。](/media/articles/f3ac6ff72ec5d7af.webp)

# 进阶使用方案

## 样例

- 通过`{}`可以在向上或向下的数据流分析的过程中进行配置。

比如在上述的例子中，我们想要收集在数据流分析过程中的数据语句。可以使用hook，并且继续写一段新的SyntaxFlow的查询语句。

比如如下的例子：

```SQL
Runtime.getRuntime().exec(* as $para)
$para #{hook: `* as $a`}-> as $paraDef
```

在配置中的`hook`内可以通过`` ` ``来写入一段新的SyntaxFlow语句，在数据流追踪过程中的每一个值都会运行该语句，并且该语句支持所有的syntaxFlow特性。

我们可以看到审计结果：

![图片展示的是SyntaxFlow数据流分析的审计结果界面。上方代码框内是包含hook配置的SyntaxFlow查询语句，为`Runtime.getRuntime().exec(* as $para) $para #{hook: * as $a'} -> as $paraDef`。下方展示了审计结果，有`para`和`paraDef`等参数信息，每个参数后跟着一系列调用关系及对应的文件和行数，如`Undefined-Runtime.getRuntime(Undefined-Runtime) control.java:39`等。该图片与上文提到的在配置中使用hook收集数据流分析过程中的数据语句的内容相呼应，呈现了具体的审计结果。](/media/articles/e40d42beb6ad3ef9.webp)

同样我们可以画出该审计过程的图，紫色节点代表当前选中的节点，可以看到他是之前我们审计得到参数`cmd`过程中的一个节点。

![图片展示了一个审计过程的图。图中有多个椭圆形节点，包含如“cmd”“CndObject_getCmd”等标识。其中紫色节点“CndObject_getCmd”为当前选中节点。图中存在红色箭头，标有“step\[2\]: search getRuntime”等步骤信息，指示流程顺序。该图是对上文提到的在数据流分析中使用hook配置及SyntaxFlow语句进行审计过程的可视化呈现，展示了获取参数cmd过程中的节点及步骤关系。](/media/articles/d09e5da52540df3f.webp)



## 实际使用

接下来是一个Java Servlet的代码样例，在Servlet中规定了doPost/doGet等方法，因此我们可以确定请求的入口是这些函数的第一个参数。但是同时 用户自己编写的代码也可以接收到request类型的参数但是这些函数并不一定会被调用。例子如下：

```Java
package net.javaguides.usermanagement.web;

import java.io.IOException;
import java.sql.SQLException;
import java.util.List;

import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import net.javaguides.usermanagement.dao.UserDAO;
import net.javaguides.usermanagement.model.User;

/**
 * ControllerServlet.java
 * This servlet acts as a page controller for the application, handling all
 * requests from the user.
 * @email Ramesh Fadatare
 */

@WebServlet("/")
public class UserServlet extends HttpServlet {
        private static final long serialVersionUID = 1L;
        private UserDAO userDAO;
        public void init() {
                userDAO = new UserDAO();
        }

    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        // 设置响应内容类型
        resp.setContentType("text/html");
        // 从请求中获取参数
        String message = req.getParameter("message");
        // 获取响应的 writer 对象，用于发送响应数据
        PrintWriter out = resp.getWriter();
        out.println("<h1>Received POST request with message: " + message + "</h1>");
    }

        protected void doGet(HttpServletRequest request, HttpServletResponse response)
                        throws ServletException, IOException {
                String action = request.getServletPath();

                try {
                        switch (action) {
                        case "/insert":
                                insertUser(request, response);
                                break;
                        }
                } catch (SQLException ex) {
                        throw new ServletException(ex);
                }
        }

        private void insertUser(HttpServletRequest request, HttpServletResponse response) 
                        throws SQLException, IOException {
                String name = request.getParameter("name");
                String email = request.getParameter("email");
                String country = request.getParameter("country");
                User newUser = new User(name, email, country);
                userDAO.insertUser(newUser);
                response.sendRedirect("list");
        }
}

```

我们可以从这些函数开始入手获取参数获取到`request`，并持续向下追踪使用，并配合hook配置获取所有的`request.getParameter`成员的参数。

```SQL
/(do(Get|Post|Delete|Filter|\w+))|(service)/(*?{!have: this && opcode: param } as $req);
$req.getParameter as $directParam;
$req -{
  hook: `*.getParameter as $indirectParam`
}->
$directParam + $indirectParam as $output;
$output(, * as $ParamName)
```

得到结果如下：

![图片展示了Java Servlet代码样例的代码审计结果。上方代码定义了变量`$req`，并在hook中配置获取`getParameter`参数，将直接和间接参数合并为`$output`并输出参数名。下方审计结果列表显示了`directParam`、`indirectParam`、`output`及`ParamName`等内容，其中`ParamName`下突出显示了`"name" Demo2.java:59`。该图片与上文提到的从Java Servlet相关函数入手获取参数，并配合hook配置获取`request.getParameter`成员参数的内容相关，呈现了实际审计得到的参数情况。](/media/articles/4486d1c5a066c73b.webp)

# 预告：YakRunner

熟悉的朋友应该感觉到本文中的截图都是yakit风格， 目前的新版本YakRunner将会要支持SSA项目编译以及审计功能。大家将要有GUI用了哈哈哈哈
