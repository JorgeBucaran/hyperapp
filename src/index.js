var RECYCLED_NODE = 1
var LAZY_NODE = 2
var TEXT_NODE = 3
var EMPTY_OBJ = {}
var EMPTY_ARR = []
var isArray = Array.isArray
var defer =
  typeof requestAnimationFrame !== "undefined"
    ? requestAnimationFrame
    : setTimeout

var createClass = function(obj) {
  var out = ""

  if (typeof obj === "string") return obj

  if (isArray(obj) && obj.length > 0) {
    for (var k = 0, tmp; k < obj.length; k++) {
      if ((tmp = createClass(obj[k])) !== "") {
        out += (out && " ") + tmp
      }
    }
  } else {
    for (var k in obj) {
      if (obj[k]) {
        out += (out && " ") + k
      }
    }
  }

  return out
}

var merge = function(a, b) {
  var out = {}

  for (var k in a) out[k] = a[k]
  for (var k in b) out[k] = b[k]

  return out
}

var batch = function(list) {
  return list.reduce(function(out, item) {
    return out.concat(
      !item || item === true
        ? 0
        : typeof item[0] === "function"
        ? [item]
        : batch(item)
    )
  }, EMPTY_ARR)
}

var compose = function(a, b) {
  return a && b && (function(x) { return a(b(x)) }) || a || b
}

var mapEffects = function(effects, actionMap) {
  return effects.map(function(fx) {
    return [ fx[0], fx[1], compose(actionMap, fx[2]) ]
  })
}

var makeActionMap = function(extract, merge) {
  return function actionMap(action) {
    return function(state, data) {
      return (function resolve(x, state, data) {
        return typeof x === "function"
          ? resolve(x(extract(state), data), state)
          : !isArray(x)
            ? merge(state, x)
            : !isArray(x[0]) && typeof x[0] !== "function"
              ? [merge(state, x[0])].concat(mapEffects(x.slice(1), actionMap))
              : resolve(
                x[0],
                state,
                typeof x[1] === "function" ? x[1](data) : x[1]
              )
      })(action, state, data)
    }
  }
}

var mappedDispatch = function(dispatch, map) {
  return function(action, props) {
    dispatch(action, props, map)
  }
}

export var map = function(extract, merge, x, actionMap = makeActionMap(extract, merge)) {
  return isArray(x)
    ? mapEffects(x, actionMap)
    : typeof x === "function"
      ? actionMap(x)
      : (x.actionMap = compose(actionMap, x.actionMap), x)
}

var isSameAction = function(a, b) {
  return isArray(a) && isArray(b) && a[0] === b[0] && typeof a[0] === "function"
}

var shouldRestart = function(a, b) {
  if (a !== b) {
    for (var k in merge(a, b)) {
      if (a[k] !== b[k] && !isSameAction(a[k], b[k])) return true
      b[k] = a[k]
    }
  }
}

var patchSubs = function(oldSubs, newSubs, dispatch) {
  for (
    var i = 0, oldSub, newSub, subs = [];
    i < oldSubs.length || i < newSubs.length;
    i++
  ) {
    oldSub = oldSubs[i]
    newSub = newSubs[i]
    subs.push(
      newSub
        ? !oldSub ||
          newSub[0] !== oldSub[0] ||
          shouldRestart(newSub[1], oldSub[1])
          ? [
              newSub[0],
              newSub[1],
              newSub[0](mappedDispatch(dispatch, newSub[2]), newSub[1]),
              oldSub && oldSub[2]()
            ]
          : oldSub
        : oldSub && oldSub[2]()
    )
  }
  return subs
}

var patchProperty = function(node, key, oldValue, newValue, listener, actionMap, isSvg) {
  if (key === "key") {
  } else if (key === "style") {
    for (var k in merge(oldValue, newValue)) {
      oldValue = newValue == null || newValue[k] == null ? "" : newValue[k]
      if (k[0] === "-") {
        node[key].setProperty(k, oldValue)
      } else {
        node[key][k] = oldValue
      }
    }
  } else if (key[0] === "o" && key[1] === "n") {
    node.actionMap = actionMap
    if (
      !((node.actions || (node.actions = {}))[
        (key = key.slice(2).toLowerCase())
      ] = newValue)
    ) {
      node.removeEventListener(key, listener)
    } else if (!oldValue) {
      node.addEventListener(key, listener)
    }
  } else if (!isSvg && key !== "list" && key in node) {
    node[key] = newValue == null ? "" : newValue
  } else if (
    newValue == null ||
    newValue === false ||
    (key === "class" && !(newValue = createClass(newValue)))
  ) {
    node.removeAttribute(key)
  } else {
    node.setAttribute(key, newValue)
  }
}

var createNode = function(vdom, listener, actionMap, isSvg) {
  var ns = "http://www.w3.org/2000/svg"
  var props = vdom.props
  var node =
    vdom.type === TEXT_NODE
      ? document.createTextNode(vdom.name)
      : (isSvg = isSvg || vdom.name === "svg")
      ? document.createElementNS(ns, vdom.name, { is: props.is })
      : document.createElement(vdom.name, { is: props.is })

  for (var k in props) {
    patchProperty(node, k, null, props[k], listener, actionMap, isSvg)
  }

  for (var i = 0, len = vdom.children.length; i < len; i++) {
    node.appendChild(
      createNode(
        (vdom.children[i] = getVNode(vdom.children[i])),
        listener,
        compose(actionMap, vdom.children[i].actionMap),
        isSvg
      )
    )
  }

  return (vdom.node = node)
}

var getKey = function(vdom) {
  return vdom == null ? null : vdom.key
}

var patch = function(parent, node, oldVNode, newVNode, listener, actionMap, isSvg) {
  actionMap = compose(actionMap, newVNode.actionMap)

  if (oldVNode === newVNode) {
  } else if (
    oldVNode != null &&
    oldVNode.type === TEXT_NODE &&
    newVNode.type === TEXT_NODE
  ) {
    if (oldVNode.name !== newVNode.name) node.nodeValue = newVNode.name
  } else if (oldVNode == null || oldVNode.name !== newVNode.name) {
    node = parent.insertBefore(
      createNode((newVNode = getVNode(newVNode)), listener, actionMap, isSvg),
      node
    )
    if (oldVNode != null) {
      parent.removeChild(oldVNode.node)
    }
  } else {
    var tmpVKid
    var oldVKid

    var oldKey
    var newKey

    var oldVProps = oldVNode.props
    var newVProps = newVNode.props

    var oldVKids = oldVNode.children
    var newVKids = newVNode.children

    var oldHead = 0
    var newHead = 0
    var oldTail = oldVKids.length - 1
    var newTail = newVKids.length - 1

    isSvg = isSvg || newVNode.name === "svg"

    for (var i in merge(oldVProps, newVProps)) {
      if (
        (i === "value" || i === "selected" || i === "checked"
          ? node[i]
          : oldVProps[i]) !== newVProps[i]
      ) {
        patchProperty(node, i, oldVProps[i], newVProps[i], listener, actionMap, isSvg)
      }
    }

    while (newHead <= newTail && oldHead <= oldTail) {
      if (
        (oldKey = getKey(oldVKids[oldHead])) == null ||
        oldKey !== getKey(newVKids[newHead])
      ) {
        break
      }

      patch(
        node,
        oldVKids[oldHead].node,
        oldVKids[oldHead],
        (newVKids[newHead] = getVNode(
          newVKids[newHead++],
          oldVKids[oldHead++]
        )),
        listener,
        actionMap,
        isSvg
      )
    }

    while (newHead <= newTail && oldHead <= oldTail) {
      if (
        (oldKey = getKey(oldVKids[oldTail])) == null ||
        oldKey !== getKey(newVKids[newTail])
      ) {
        break
      }

      patch(
        node,
        oldVKids[oldTail].node,
        oldVKids[oldTail],
        (newVKids[newTail] = getVNode(
          newVKids[newTail--],
          oldVKids[oldTail--]
        )),
        listener,
        actionMap,
        isSvg
      )
    }

    if (oldHead > oldTail) {
      while (newHead <= newTail) {
        node.insertBefore(
          createNode(
            (newVKids[newHead] = getVNode(newVKids[newHead++])),
            listener,
            actionMap,
            isSvg
          ),
          (oldVKid = oldVKids[oldHead]) && oldVKid.node
        )
      }
    } else if (newHead > newTail) {
      while (oldHead <= oldTail) {
        node.removeChild(oldVKids[oldHead++].node)
      }
    } else {
      for (var i = oldHead, keyed = {}, newKeyed = {}; i <= oldTail; i++) {
        if ((oldKey = oldVKids[i].key) != null) {
          keyed[oldKey] = oldVKids[i]
        }
      }

      while (newHead <= newTail) {
        oldKey = getKey((oldVKid = oldVKids[oldHead]))
        newKey = getKey(
          (newVKids[newHead] = getVNode(newVKids[newHead], oldVKid))
        )

        if (
          newKeyed[oldKey] ||
          (newKey != null && newKey === getKey(oldVKids[oldHead + 1]))
        ) {
          if (oldKey == null) {
            node.removeChild(oldVKid.node)
          }
          oldHead++
          continue
        }

        if (newKey == null || oldVNode.type === RECYCLED_NODE) {
          if (oldKey == null) {
            patch(
              node,
              oldVKid && oldVKid.node,
              oldVKid,
              newVKids[newHead],
              listener,
              actionMap,
              isSvg
            )
            newHead++
          }
          oldHead++
        } else {
          if (oldKey === newKey) {
            patch(
              node,
              oldVKid.node,
              oldVKid,
              newVKids[newHead],
              listener,
              actionMap,
              isSvg
            )
            newKeyed[newKey] = true
            oldHead++
          } else {
            if ((tmpVKid = keyed[newKey]) != null) {
              patch(
                node,
                node.insertBefore(tmpVKid.node, oldVKid && oldVKid.node),
                tmpVKid,
                newVKids[newHead],
                listener,
                actionMap,
                isSvg
              )
              newKeyed[newKey] = true
            } else {
              patch(
                node,
                oldVKid && oldVKid.node,
                null,
                newVKids[newHead],
                listener,
                actionMap,
                isSvg
              )
            }
          }
          newHead++
        }
      }

      while (oldHead <= oldTail) {
        if (getKey((oldVKid = oldVKids[oldHead++])) == null) {
          node.removeChild(oldVKid.node)
        }
      }

      for (var i in keyed) {
        if (newKeyed[i] == null) {
          node.removeChild(keyed[i].node)
        }
      }
    }
  }

  return (newVNode.node = node)
}

var propsChanged = function(a, b) {
  for (var k in a) if (a[k] !== b[k]) return true
  for (var k in b) if (a[k] !== b[k]) return true
}

var getTextVNode = function(node) {
  return typeof node === "object" ? node : createTextVNode(node)
}

var getVNode = function(newVNode, oldVNode) {
  return newVNode.type === LAZY_NODE
    ? ((!oldVNode ||
        (oldVNode.type !== LAZY_NODE ||
          propsChanged(oldVNode.lazy, newVNode.lazy))) &&
        ((oldVNode = getTextVNode(newVNode.lazy.view(newVNode.lazy))).lazy =
          newVNode.lazy),
      oldVNode)
    : newVNode
}

var createVNode = function(name, props, children, node, key, type) {
  return {
    name: name,
    props: props,
    children: children,
    node: node,
    type: type,
    key: key
  }
}

var createTextVNode = function(value, node) {
  return createVNode(value, EMPTY_OBJ, EMPTY_ARR, node, undefined, TEXT_NODE)
}

var recycleNode = function(node) {
  return node.nodeType === TEXT_NODE
    ? createTextVNode(node.nodeValue, node)
    : createVNode(
        node.nodeName.toLowerCase(),
        EMPTY_OBJ,
        EMPTY_ARR.map.call(node.childNodes, recycleNode),
        node,
        undefined,
        RECYCLED_NODE
      )
}

export var Lazy = function(props) {
  return {
    lazy: props,
    type: LAZY_NODE
  }
}

export var h = function(name, props) {
  for (var vdom, rest = [], children = [], i = arguments.length; i-- > 2; ) {
    rest.push(arguments[i])
  }

  while (rest.length > 0) {
    if (isArray((vdom = rest.pop()))) {
      for (var i = vdom.length; i-- > 0; ) {
        rest.push(vdom[i])
      }
    } else if (vdom === false || vdom === true || vdom == null) {
    } else {
      children.push(getTextVNode(vdom))
    }
  }

  props = props || EMPTY_OBJ

  return typeof name === "function"
    ? name(props, children)
    : createVNode(name, props, children, undefined, props.key)
}

export var app = function(props) {
  var state = {}
  var lock = false
  var view = props.view
  var node = props.node
  var vdom = node && recycleNode(node)
  var subscriptions = props.subscriptions
  var subs = []

  var listener = function(event) {
    dispatch(this.actions[event.type], event, this.actionMap)
  }

  var setState = function(newState) {
    if (state !== newState) {
      state = newState
      if (subscriptions) {
        subs = patchSubs(subs, batch([subscriptions(state)]), dispatch)
      }
      if (view && !lock) defer(render, (lock = true))
    }
    return state
  }

  var dispatch = (props.middleware ||
    function(obj) {
      return obj
    })(function(action, props, map) {
      return typeof action === "function"
        ? dispatch((map ? map(action) : action)(state, props))
        : isArray(action)
          ? typeof action[0] === "function" || isArray(action[0])
            ? dispatch(
              action[0],
              typeof action[1] === "function" ? action[1](props) : action[1],
              map
            )
            : (batch(action.slice(1)).map(function(fx) {
              fx && fx[0](mappedDispatch(dispatch, fx[2]), fx[1])
            }, setState(action[0])),
              state)
          : setState(action)
    })

  var render = function() {
    lock = false
    node = patch(
      node.parentNode,
      node,
      vdom,
      (vdom = getTextVNode(view(state))),
      listener
    )
  }

  dispatch(props.init)
}
