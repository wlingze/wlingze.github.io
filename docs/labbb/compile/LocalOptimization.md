---
title: LocalOptimization
date: 2022-02-26 17:59:28
permalink: /pages/cae039/
categories:
  - labbb
  - compile
tags:
  - 
---
# local Optimization 理论&& llvm实现

[[toc]]

## 基本概念

### BasicBlock

基本块， 在编译优化中，一个函数被划分为多个基本块， 一个基本块中有多个指令组成。

* 只有基本块中的第一个指令可以从其他块到达。 (也就是说基本快中不能存在分支)
* 所有的指令在基本块中都是顺序往下执行的。

在我们进行优化时， 最底层处理的是指令 `Instruction`， 指令构成基本块`BasicBlock`， 通过基本快中的跳转关系来表达条件或循环的逻辑关系，并构成函数`Function`。 

在基本块中的优化称为 局部优化 `Local Optimizations`。 

### Flow Graphs

程序控制流， 这是一个图结构，每个节点是一个基本块 `BasicBlock`， 

第一个基本块称为`start`或`entry`节点， 

### 基本块的划分

基本块的开头：

* 函数的首条指令
* 一个jmp的目标地址
* 一句jmp语句的下一行

确定了基本快的开头以后，每个基本块的结尾都是挨着基本块开头的，于是我们可以划分出基本块。



## 优化

### 优化的分类

算法优化 在一个指令中进行，比如`a+0 => a`， 

局部优化， 在一个基本块中，指令间的关系。

全局优化， 在一个控制流中(或者说一个函数内),  基本块之间关系。

过程间优化， 在一个程序内，多个函数间优化。

### 局部优化

在一个基本块中的分析和转换，

局部优化的例子:

* 局部共同表达式消除
  * 分析：相同的计算表达式出现多次
  * 转换： 替换为一个
* 局部常量折叠或消除
  * 分析：在编译过程中可以计算出来的数据
  * 转换：直接替换为数据或者计算值
* 不可达代码消除

### 全局优化/过程间优化

* 全局形式的局部优化
  * 全局共同表达式消除
  * 全局常量折叠
  * 全局不可达代码消除
* 循环优化
  * 减少迭代中的计算
  * 代码移位
  * 归纳变量消除
* 其他控制结构
  * 代码提升: 
    * 消除分支中重复代码。

## 局部优化

共同表达式消除， 主要有两种方案: 

### 图形抽象

首先形成类似抽象语法树的树状结构， 然后链接合并相同变量，形成抽象图结构，

从图中获取表达式。

带来问题：

* 可能会有赋值语句出错
* 没有关于时间的对数值进行更新的处理。

### 变量编号 

就是将变量进行编号，然后维护一个映射关系， 从变量到数据的映射关系，后续如果有对这个数据的使用，会先进行查表， 如果存在这个变量，则存在重复定义，可以进行优化， 如果不存在则可以插入到表里。

一般实现都是使用map/ hashtable， 

但是要注意的是， 这个变量也要使用时间做一次标记，如果变量被更新了，不能与原来的算作同一个变量。



## 实现: cscd70: Assignment1

### FunctionInfo

这个比较简单，打印对应的信息即可。应该都在`Function`定义中，从`Module`依次获取，然后调用对应的方法即可。 

```cpp
  virtual bool runOnModule(Module &M) override {
    outs() << "CSCD70 Function Information Pass"
           << "\n";

    /**
     * @todo(cscd70) Please complete this method.
     */
    outs() << "Name\t"
           << "#Args\t"
           << "#Calls\t"
           << "#Blocks\t"
           << "#Insts\t"
           << "\n";
    for (auto Item = M.begin(); Item != M.end(); Item++) {
      outs() << Item->getName() << "\t" << Item->arg_size() << "\t"
             << Item->getNumUses() << "\t" << Item->size() << "\t"
             << Item->getInstructionCount() << "\n";
    }

    return false;
  }
```

### 0-UnuseOperation

这个是我自己写的，在测试的时候发现存在一些后续并没有被使用的代码，于是进行删除，其实思路也比较简单。

`Instruction`中有一个`use_empty()`方法，可以获取这个`Instruction`是否没有被使用过，如果是的话就可以进行删除了， 因为直接删除会出现问题，这里使用了个vector并在最后进行统一删除。

```cpp

class UnuseOpt final : public FunctionPass {
private:
  void deleteInstruction(std::vector<Instruction *> Insts) {
    for (auto &Inst : Insts) {
      if (Inst->isSafeToRemove())
        Inst->eraseFromParent();
    }
  }
  void runOnBasicBlock(BasicBlock &B) {
    std::vector<Instruction *> DeleteInst;
    for (auto &Inst : B) {
      if (Inst.use_empty()) {
        DeleteInst.push_back(&Inst);
      }
    }
    deleteInstruction(DeleteInst);
  }

public:
  static char ID;

  UnuseOpt() : FunctionPass(ID) {}

  /**
   * @todo(cscd70) Please complete the methods below.
   */
  virtual void getAnalysisUsage(AnalysisUsage &AU) const override {}

  virtual bool runOnFunction(Function &F) override {
    for (auto &Item : F) {
      runOnBasicBlock(Item);
      runOnBasicBlock(Item);
    }
    return false;
  }
}; // class 
```

后面这部分运行了两次，因为可能存在某个值被引用过，但是引用他的其实也是unuse， 那么这个其实也属于是unuse指令，

可以后续加一个判断，

// todo 

### 1-AlgebraicIdentity

这个也比较简单，还是在`BasicBlock`中进行操作，要获取两个操作数和运算符， 

* 获取第一个操作数: `Inst.getOperand(0)`
* 获取运算符: `Inst.getOpcode()`返回的对象是 `Instruction::Add`之类的预定义好的运算符。
* 操作数判断类型，`isa<ConstantInt>(Operand0)`， 判断是否为`ConstantInt`类型， 转换: `ConstantInt ConstValue0 = dyn_cast<ConstantInt>(Operand0)`， 

首先获取操作数，并尝试转化为整数: 

```cpp
  void runOnBasicBlock(BasicBlock &B) {
    bool AlgebraicFlag;
    std::vector<Instruction *> DeleteInst;
    for (auto &Inst : B) {
      if (Inst.isBinaryOp()) {
        AlgebraicFlag = true;
        Value *Operand0 = Inst.getOperand(0);
        Value *Operand1 = Inst.getOperand(1);
        ConstantInt *ConstValue0, *ConstValue1;
        if (isa<ConstantInt>(Operand0)) {
          ConstValue0 = dyn_cast<ConstantInt>(Operand0);
        }
        if (isa<ConstantInt>(Operand1)) {
          ConstValue1 = dyn_cast<ConstantInt>(Operand1);
        }
```

然后判断是否可以优化， 

如果两个操作数都是`ConstantInt`类型，那么都是整数可以直接进行运算。

```cpp

        if (isa<ConstantInt>(Operand0) && isa<ConstantInt>(Operand1)) {
          switch (Inst.getOpcode()) {
          case Instruction::Add: {
            Inst.replaceAllUsesWith(ConstantInt::getSigned(
                Inst.getType(),
                ConstValue0->getSExtValue() + ConstValue1->getSExtValue()));
            break;
          }
          case Instruction::Sub: {
            Inst.replaceAllUsesWith(ConstantInt::getSigned(
                Inst.getType(),
                ConstValue0->getSExtValue() - ConstValue1->getSExtValue()));
            break;
          }
          case Instruction::Mul: {
            Inst.replaceAllUsesWith(ConstantInt::getSigned(
                Inst.getType(),
                ConstValue0->getSExtValue() * ConstValue1->getSExtValue()));
            break;
          }
          case Instruction::SDiv: {
            Inst.replaceAllUsesWith(ConstantInt::getSigned(
                Inst.getType(),
                ConstValue0->getSExtValue() / ConstValue1->getSExtValue()));
            break;
          }
          default: {
            AlgebraicFlag = false;
          }
          }
          if (AlgebraicFlag) {
            DeleteInst.push_back(&Inst);
          }
          continue;
        }
```

如果有一个是`ConstantInt`类型，那么可以判断是否满足简化的公式，比如`x+1 => x`，

```cpp

        switch (Inst.getOpcode()) {
        case Instruction::Add: {
          if (isa<ConstantInt>(Operand0) &&
              (ConstValue0->getSExtValue() == 0)) {
            // 0+x = x
            Inst.replaceAllUsesWith(Operand1);
          } else if (isa<ConstantInt>(Operand1) &&
                     (ConstValue1->getSExtValue() == 0)) {
            // x+0 = x
            Inst.replaceAllUsesWith(Operand0);
          } else {
            AlgebraicFlag = false;
          }
          break;
        }
        case Instruction::Sub: {
          if (isa<ConstantInt>(Operand1) &&
              (ConstValue1->getSExtValue() == 0)) {
            // x-0 = x
            Inst.replaceAllUsesWith(Operand0);
          } else if (Operand0 == Operand1) {
            // x-x = 0
            Inst.replaceAllUsesWith(ConstantInt::getSigned(Inst.getType(), 0));
          } else {
            AlgebraicFlag = false;
          }
          break;
        }
        case Instruction::Mul: {
          if (isa<ConstantInt>(Operand0) &&
              (ConstValue0->getSExtValue() == 1)) {
            // 1*x = x
            Inst.replaceAllUsesWith(Operand1);
          } else if (isa<ConstantInt>(Operand1) &&
                     (ConstValue1->getSExtValue() == 1)) {
            // x*1 = x
            Inst.replaceAllUsesWith(Operand0);
          } else {
            AlgebraicFlag = false;
          }
          break;
        }
        case Instruction::SDiv: {
          // x/1 = x
          if (isa<ConstantInt>(Operand1) &&
              (ConstValue1->getSExtValue() == 1)) {
            Inst.replaceAllUsesWith(Operand0);
          } else if (Operand0 == Operand1) {
            // x/x = 1
            Inst.replaceAllUsesWith(ConstantInt::getSigned(Inst.getType(), 1));
          } else {
            AlgebraicFlag = false;
          }
          break;
        }
        default: {
          AlgebraicFlag = false;
          break;
        }
        }
```

最后可以通过`AlgebraicFlag`判断是否成功优化，成功的话将原本的语句删除。

```cpp
        if (AlgebraicFlag) {
          DeleteInst.push_back(&Inst);
        }
      }
    } // for end 
    deleteInstruction(DeleteInst);
  }

```

### 2-StrengthReduction

其实和上一个差不多，在乘法除法判断一下是否可以转化为左移右移操作。

```cpp
  size_t getShift(unsigned Num) {
    if ((Num & (Num - 1)))
      return 0;
    size_t Shift = 0;
    while (Num != 1) {
      Num >>= 1;
      Shift++;
    }
    return Shift;
  }

  void runOnBasicBlock(BasicBlock &B) {
    std::vector<Instruction *> DeleteInstruction;
    bool StregthFlag;
    for (auto &Inst : B) {

      if (Inst.isBinaryOp()) {
        StregthFlag = true;
        Value *Operand0 = Inst.getOperand(0);
        Value *Operand1 = Inst.getOperand(1);
        ConstantInt *ConsVal0, *ConsVal1;
        size_t Shift;
        if (isa<ConstantInt>(Operand0))
          ConsVal0 = dyn_cast<ConstantInt>(Operand0);
        if (isa<ConstantInt>(Operand1))
          ConsVal1 = dyn_cast<ConstantInt>(Operand1);

        switch (Inst.getOpcode()) {
        case Instruction::Mul: {
          if (isa<ConstantInt>(Operand0) &&
              (Shift = getShift(ConsVal0->getZExtValue()))) {
            BinaryOperator *NewInst = BinaryOperator::Create(
                Instruction::Shl, Operand1,
                ConstantInt::getSigned(Inst.getType(), Shift), "shl", &Inst);
            Inst.replaceAllUsesWith(NewInst);
          } else if (isa<ConstantInt>(Operand1) &&
                     (Shift = getShift(ConsVal1->getZExtValue()))) {
            BinaryOperator *NewInst = BinaryOperator::Create(
                Instruction::Shl, Operand0,
                ConstantInt::getSigned(Inst.getType(), Shift), "shl", &Inst);
            Inst.replaceAllUsesWith(NewInst);
          } else {
            StregthFlag = false;
          }
          break;
        }
        case Instruction::SDiv: {
          if (isa<ConstantInt>(Operand1) &&
              (Shift = getShift(ConsVal1->getZExtValue()))) {
            BinaryOperator *NewInst = BinaryOperator::Create(
                Instruction::LShr, Operand0,
                ConstantInt::getSigned(Inst.getType(), Shift), "shr", &Inst);
            Inst.replaceAllUsesWith(NewInst);
          } else {
            StregthFlag = false;
          }
          break;
        }
        default: {
          StregthFlag = false;
        }
        }

        if (StregthFlag) {
          DeleteInstruction.push_back(&Inst);
        }
      }
    }
    deleteInst(DeleteInstruction);
  }
```

### 3-MultiInstOpt 

其实这个有点麻烦，需要做多行指令间的优化，这就是我们前面提到的局部优化理论对应的位置了，之前都属于算法优化部分。

这里采用变量编号的手段， 而且使用llvm, 本身是SSA, 不可改变的数据，于是没有可能匹配到更改后的变量的问题，于是我们可以直接查找到相同指令即可进行替换。

使用`std::map`保存变量，并且使用 `operand0 opcode operand1 -- Instruction`作为映射方案，因为通过`Instruction`我们可以获取到需要的所有数据，然后使用字符串形式的运算式进行匹配即可。

```cpp
  std::map<std::string, Instruction *> InstMap;

   Instruction *findInst(std::string op) {
    auto search = InstMap.find(op);
    if (search == InstMap.end()) {
      return nullptr;
    }
    return search->second;
  }


  void runOnBasicBlock(BasicBlock &B) {
    std::vector<Instruction *> DeleteInst;
    bool MultiInstFlag;
    for (auto &Inst : B) {
      if (Inst.isBinaryOp()) {

        Value *Operand0 = Inst.getOperand(0);
        Value *Operand1 = Inst.getOperand(1);

        std::string str = getValue(Operand0) + " " + Inst.getOpcodeName() +
                          " " + getValue(Operand1);

        Instruction *search;
        if ((search = findInst(str)) != nullptr) {
          Inst.replaceAllUsesWith(search);
          DeleteInst.push_back(&Inst);
          continue;
        } else {
          InstMap[str] = &Inst;
        }
```

这一部分就是维护`InstMap`的代码，出现重复可以直接替换并删除对应语句。效果如下：

![image-20220301173635460](https://s2.loli.net/2022/03/01/TXi2yBEzw1htvxf.png)

然后我们开始使用`InstMap`进行优化，这里只有当我们的操作数一个`ConstantInt`一个`Instruction`的时候可以进行优化， 即`a=b+1; b=c-1 => a=c; b=c-1`这种形式的优化。

```cpp
  bool canOpt(Instruction &Inst) {
    if (!Inst.isBinaryOp()) {
      return false;
    }
    Value *Operand0 = Inst.getOperand(0);
    Value *Operand1 = Inst.getOperand(1);

    return ((isa<ConstantInt>(Operand0) && isa<Instruction>(Operand1)) ||
            (isa<Instruction>(Operand0) && isa<ConstantInt>(Operand1)));
  }

```

那么继续， 这一部分有点繁琐，主要是获取到本指令对应的两个操作数， 分别`ConstOperand1`和`Inst2`， 而要继续判断`Inst2`是否也是这种可优化的形式，获取它的两个操作数，分别为`InstOperand2`和`ConstOperand2`， 

因为不能判断两个操作数具体是哪个是`ConstantInt`哪个是`Instruction`， 所以使用一个判断和对应的变量进行一层封装。

```cpp

        if (!canOpt(Inst))
          continue;

        Instruction *InstValue0, *InstValue1, *Inst2;
        ConstantInt *ConstValue0, *ConstValue1, *ConstOperand1;
        if (isa<Instruction>(Operand0)) {
          InstValue0 = dyn_cast<Instruction>(Operand0);
          Inst2 = InstValue0;
        }
        if (isa<Instruction>(Operand1)) {
          InstValue1 = dyn_cast<Instruction>(Operand1);
          Inst2 = InstValue1;
        }
        if (isa<ConstantInt>(Operand0)) {
          ConstValue0 = dyn_cast<ConstantInt>(Operand0);
          ConstOperand1 = ConstValue0;
        }
        if (isa<ConstantInt>(Operand1)) {
          ConstValue1 = dyn_cast<ConstantInt>(Operand1);
          ConstOperand1 = ConstValue1;
        }

        if (!canOpt(*Inst2)) {
          continue;
        }
        MultiInstFlag = true;

        Value *Operand2 = Inst2->getOperand(0);
        Value *Operand3 = Inst2->getOperand(1);
        Instruction *InstValue2, *InstValue3, *InstOperand2;
        ConstantInt *ConstValue2, *ConstValue3, *ConstOperand2;
        if (isa<Instruction>(Operand2)) {
          InstValue2 = dyn_cast<Instruction>(Operand2);
          InstOperand2 = InstValue2;
        }
        if (isa<Instruction>(Operand3)) {
          InstValue3 = dyn_cast<Instruction>(Operand3);
          InstOperand2 = InstValue3;
        }
        if (isa<ConstantInt>(Operand2)) {
          ConstValue2 = dyn_cast<ConstantInt>(Operand2);
          ConstOperand2 = ConstValue2;
        }
        if (isa<ConstantInt>(Operand3)) {
          ConstValue3 = dyn_cast<ConstantInt>(Operand3);
          ConstOperand2 = ConstValue3;
        }

        int64_t ConstValueInt1 = ConstOperand1->getSExtValue();
        int64_t ConstValueInt2 = ConstOperand2->getSExtValue();
```

于是可以进行优化了。判断条件并编写对应的规则即可。

这里只写了一段，其他的规则添加然后重复编写即可。

这一段是，

* 如果`Inst`为加法， 
  * `Inst2`为加法的话，则`Inst = const1 + Inst2 = (const1 + const2) + instoperand2`
  * `Inst2`为减法， 
    * const2在左侧， 则`Inst = const1 + Inst2 = const1 + const2 - instoperand2`
    * const2在右侧 ， 则`Inst = const1 + Inst2 = const1 + instoperand2 - const2 = instoperand2 + (const1 - const2) `
      * 如果const1 > const2, 则为加法， 
      * 如果const1 < const2, 则为减法 ，
      * 如果const1 = const2, 则`Inst = instoperand2`， 

```cpp

        Instruction *NewInst;
        switch (Inst.getOpcode()) {
        case Instruction::Add: {

          switch (Inst2->getOpcode()) {
          case Instruction::Add: {
            NewInst = BinaryOperator::Create(
                Instruction::Add, InstOperand2,
                ConstantInt::getSigned(ConstOperand1->getType(),
                                       ConstValueInt1 + ConstValueInt2),
                "new_add", &Inst);
            break;
          }
          case Instruction::Sub: {
            if (ConstOperand2 == ConstValue2) {
              // left
              // inst = con1 + con2 - inst2
              NewInst = BinaryOperator::Create(
                  Instruction::Sub,
                  ConstantInt::getSigned(ConstOperand1->getType(),
                                         ConstValueInt1 + ConstValueInt2),
                  InstOperand2, "new_sub", &Inst);
            } else {
              // right
              // inst = con1 + inst2 - con2
              if (ConstValueInt1 > ConstValueInt2) {
                NewInst = BinaryOperator::Create(
                    Instruction::Add,
                    ConstantInt::getSigned(ConstOperand1->getType(),
                                           ConstValueInt1 - ConstValueInt2),
                    InstOperand2, "new_sub", &Inst);
              } else if (ConstValueInt1 < ConstValueInt2) {
                NewInst = BinaryOperator::Create(

                    Instruction::Sub, InstOperand2,
                    ConstantInt::getSigned(ConstOperand1->getType(),
                                           ConstValueInt2 - ConstValueInt1),
                    "new_sub", &Inst);
              } else {
                NewInst = InstOperand2;
              }
            }
            break;
          }
          default: {
            MultiInstFlag = false;
          }
          }

          break;
        }
        default: {
          MultiInstFlag = false;
        }
        }
```

最后对优化了的指令进行删除即可

```cpp

        if (MultiInstFlag) {
          Inst.replaceAllUsesWith(NewInst);
          DeleteInst.push_back(&Inst);
        }
      }
    } // for end 
    deleteInst(DeleteInst);
  }

```

运行如下: 

![image-20220301175129277](https://s2.loli.net/2022/03/01/BuX3ogpalW7M4ji.png)
