class Dep {
  constructor() {
    this.subs = [];
  }
  addSub(watcher) { //订阅 添加watcher
    this.subs.push(watcher)
  }
  notify() { //发布
    this.subs.forEach(watcher => {
      watcher.update()
    })
  }
}

//观察者  发布订阅  观察者 被观察者
class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm;
    this.expr = expr;
    this.cb = cb;
    this.oldValue = this.get()
  }
  get() {
    Dep.target = this; //添加订阅标记
    let value = CompileUtil.getValue(this.vm, this.expr) //在数据劫持取值中 添加订阅
    Dep.target = null;
    return value
  }
  update() { //更新操作 数据变化后 会调用观察者的update方法
    let newVal = CompileUtil.getValue(this.vm, this.expr)
    if (newVal != this.oldValue) {
      this.cb(newVal)
    }
  }
}

class Observer { //实现数据劫持
  constructor(data) {
    this.observer(data)
  }
  observer(data) {
    if (data && typeof data == 'object') {
      for (let key in data) {
        this.defineReactive(data, key, data[key])
      }
    }
  }
  defineReactive(obj, key, value) {
    this.observer(value);
    let dep = new Dep() //给每个属性都加上一个订阅
    Object.defineProperty(obj, key, { //Object.defineProperty重新定义属性 给属性添加getter 和 setter
      get() {
        //创建watcher时 会取到对应的内容,并且把watcher放到了全局
        Dep.target && dep.addSub(Dep.target); //添加观察者watcher
        return value;
      },
      set: (newVal) => {
        if (newVal != value) {
          this.observer(newVal);
          value = newVal;
          console.log('notify--notify', dep, newVal)
          dep.notify(); // 发布
        }
      }
    })
  }
}
class Compiler { //编译类
  constructor(el, vm) {
    //判断el是否是一个元素 如果不是就获取元素
    this.el = this.isElelementNode(el) ? el : document.querySelector(el);
    //把当前节点中的元素 获取到  放到内存中
    let fragment = this.node2fragment(this.el)
    //把节点中的内容进行替换
    this.vm = vm
    //编译模板 用数据编译
    this.compile(fragment)
    //把内容塞到页面中
    this.el.appendChild(fragment)
  }
  //判断是否是指令
  isDirective(attrName) {
    return attrName.startsWith('v-')
  }
  //编译元素
  compileElement(node) {
    let attributes = node.attributes;
    [...attributes].forEach(attr => {
      let {
        name,
        value: expr //重命名
      } = attr
      if (this.isDirective(name)) {
        let [, directive] = name.split('-');
        let [directiveName, eventName] = directive.split(':');
        CompileUtil[directiveName](node, expr, this.vm, eventName);
      }
    })
  }
  //编译文本
  compileText(node) { //判断文本是否包含{{}}
    let content = node.textContent;
    if (/\{\{(.+?)\}\}/.test(content)) {
      CompileUtil['text'](node, content, this.vm) //{{a}} {{b}}
    }
  }
  compile(node) { //编译内存中 dom节点
    let childNodes = node.childNodes;
    [...childNodes].forEach(child => {
      if (this.isElelementNode(child)) {
        this.compileElement(child)
        if (child.childNodes) {
          this.compile(child)
        }
      } else {
        this.compileText(child)
      }
    })
  }
  node2fragment(node) {
    let fragment = document.createDocumentFragment();
    let firstChild;
    while (firstChild = node.firstChild) {
      fragment.appendChild(firstChild); //appendChild具有移动元素性
    }
    return fragment
  }
  isElelementNode(node) {
    return node.nodeType === 1;
  }

}
CompileUtil = {
  getValue(vm, expr) { //根据表达式获取对应数据
    return expr.split('.').reduce((data, current) => {
      return data[current];
    }, vm.$data)
  },
  setValue(vm, expr, value) {
    expr.split('.').reduce((data, current, index, arr) => {
      if (arr.length - 1 == index) {
        data[current] = value
      }
      return data[current];
    }, vm.$data)
  },
  model(node, expr, vm) { //node节点 expr 表达式 vm实例
    //给输入框赋予value属性 node.value=xxx
    let fn = this.updater['modelUpdater']
    new Watcher(vm, expr, (newVal) => { //给输入框添加观察者
      fn(node, newVal)
    })
    node.addEventListener('input', (e) => {
      let value = e.target.value; //获取用户输入的内容
      this.setValue(vm, expr, value);
    })
    let value = this.getValue(vm, expr)
    fn(node, value)
  },
  on(node, expr, vm, eventName) {
    node.addEventListener(eventName, (e) => {
      vm[expr].call(vm, e)
    })
  },
  html(node, expr, vm) {
    let fn = this.updater['htmlUpdater']
    new Watcher(vm, expr, (newVal) => { //给表达式每个{{}}都添加观察者
      fn(node, newVal); //返回一个全的字符串
    })
    let value = this.getValue(vm, expr)
    fn(node, value)
  },
  getContentValue(vm, expr) {
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getValue(vm, args[1])
    })
  },
  text(node, expr, vm) {
    let fn = this.updater['textUpdater']
    let content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      //args  ==>  ["{{school.age}}", "school.age", 0, "{{school.age}}"]
      new Watcher(vm, args[1], () => { //给表达式每个{{}}都添加观察者
        fn(node, this.getContentValue(vm, expr)); //返回一个全的字符串
      })
      return this.getValue(vm, args[1])
    })
    fn(node, content)
  },
  updater: {
    modelUpdater(node, value) {
      node.value = value
      console.log('modelUpdater', value)
    },
    htmlUpdater(node, value) {
      node.innerHTML = value
      console.log('htmlUpdater', value)
    },
    textUpdater(node, value) {
      node.textContent = value
      console.log('textUpdater', value)
    }
  }
}

class Vue { // 基类
  constructor(options) {
    this.$el = options.el;
    this.$data = options.data;
    let computed = options.computed;
    let methods = options.methods;
    if (this.$el) { //元素存在 编译模板
      //把数据 全部转化成Object.defineProperty来定义
      new Observer(this.$data);
      for (let key in computed) {
        Object.defineProperty(this.$data, key, {
          get: () => {
            return computed[key].call(this);
          }
        })
      }
      for (let key in methods) {
        Object.defineProperty(this, key, {
          get() {
            return methods[key];
          }
        })
      }
      //把数据获取操作  vm上的取值操作 都代理到 vm.$data
      this.proxyVm(this.$data)
      //编译模板
      new Compiler(this.$el, this);
    }
  }
  proxyVm(data) {
    for (let key in data) {
      Object.defineProperty(this, key, {
        get() {
          return data[key]
        },
        set(newVal) {
          data[key] = newVal;
        }
      })
    }
  }
}