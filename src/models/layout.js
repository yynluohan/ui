import { get } from '@/utils/request'
import _ from 'lodash'
import arrayToTree from 'array-to-tree'
import router from 'umi/router'
import config from '@/config'
import { isWhiteRoute } from '@/utils/tools'

const cacheData = window.localStorage.getItem('panes:data')
const panesData = JSON.parse(cacheData || '{}')
const activeMenuKey = 'active:menu'

export default {
  state: {
    menus: undefined,
    menusTree: undefined,
    activeMenuIndex: 0,
    activePane: panesData.activePane,
    openKeys: panesData.openKeys || [],
    hasCache: !!cacheData,
    panes: panesData.panes || []
  },
  reducers: {
    SET_MENUS (state, { payload: menus }) {
      const menusTree = arrayToTree(_.cloneDeep(menus), {
        customID: 'ID',
        parentProperty: 'Pid',
        childrenProperty: 'Children'
      })
      let { activeMenuIndex } = state
      let localActiveMenu = parseInt(window.localStorage.getItem(activeMenuKey))
      if (_.isFinite(localActiveMenu)) {
        activeMenuIndex = localActiveMenu
      }
      if (activeMenuIndex < 0 || activeMenuIndex >= menusTree.length) {
        activeMenuIndex = 0
      }
      saveActiveMenu(activeMenuIndex)
      return { ...state, menus, menusTree, activeMenuIndex }
    },
    SET_PANES (state, { payload: panes }) {
      return { ...state, panes }
    },
    SET_ACTIVE_MENU_INDEX (state, { payload: activeMenuIndex }) {
      saveActiveMenu(activeMenuIndex)
      return { ...state, activeMenuIndex }
    },
    SET_OPEN_KEYS (state, { payload: openKeys }) {
      return { ...state, openKeys }
    },
    SET_ACTIVE_PANE (state, { payload }) {
      const { activePane, openKeys, panes } = payload
      return { ...state, activePane, openKeys, panes }
    },
    CLEAR (state) {
      const data = {
        menus: undefined,
        menusTree: undefined,
        activeMenuIndex: 0,
        activePane: undefined,
        openKeys: [],
        hasCache: false,
        panes: []
      }
      return { ...state, ...data }
    }
  },
  effects: {
    * loadMenus ({ payload }, { put, call, select }) {
      const data = yield call(get, '/api/user/menus')
      const menus = Array.isArray(data) ? data : []
      yield put({ type: 'SET_MENUS', payload: menus })
    },
    * addPane ({ payload: value }, { put, select }) {
      const state = yield select(state => state.layout)
      const { panes, menus } = state
      let activePane = panes.find(p => `${p.ID}` === `${value.ID}`)

      if (!activePane) {
        activePane = value
        panes.push(value)
      }
      const openKeys = calcOpenKeys(activePane, menus)
      // 更新启用标签
      yield put({ type: 'SET_ACTIVE_PANE', payload: { activePane, openKeys, panes } })
      // 保存到本地缓存
      savePanesData(activePane, openKeys, panes)
      // 路由跳转
      const pathname = value.IsLink ? `/sys/iframe/${value.ID}` : value.URI
      const data = _.omit(value, 'Content')
      yield router.push({
        pathname,
        state: data
      })
    },
    * delPane ({ payload: targetKey }, { put, select }) {
      const state = yield select(state => state.layout)
      const { panes } = state
      const index = panes.findIndex(p => `${p.ID}` === targetKey)
      if (index >= 0) {
        const activePane = _.get(panes, `[${index + 1}]`) || _.get(panes, `[${index - 1}]`) || _.get(panes, `[0]`) || null
        panes.splice(index, 1)
        yield put({ type: 'SET_PANES', payload: panes })
        if (panes.length > 0) {
          yield put({ type: 'addPane', payload: activePane })
        } else {
          yield put({ type: 'SET_ACTIVE_PANE', payload: { activePane: undefined, openKeys: [], panes } })
        }
      }
    }

  },
  subscriptions: {
    setup (ctx) {
      const { dispatch, history } = ctx
      const listener = route => {
        if (route.pathname !== config.loginPathname && !isWhiteRoute(route.pathname)) {
          const { layout, user } = window.g_app._store.getState()
          // 校验令牌
          if (!user.loginData) {
            dispatch({
              type: 'user/valid'
            })
          }
          // 加载菜单
          if (!layout.menus) {
            dispatch({
              type: 'loadMenus'
            })
          }
        }
      }
      history.listen(listener)
    }
  }
}

function saveActiveMenu (index) {
  if (_.isFinite(index)) {
    window.localStorage.setItem(activeMenuKey, index)
  } else {
    window.localStorage.removeItem(activeMenuKey)
  }
}

function savePanesData (activePane, openKeys, panes) {
  const panesData = {
    activePane: _.omit(activePane, 'Content'),
    panes: panes.map(item => _.omit(item, 'Content')),
    openKeys
  }
  window.localStorage.setItem('panes:data', JSON.stringify(panesData))
}

function calcOpenKeys (activePane, menus) {
  if (!activePane) {
    return
  }
  const openKeys = []
  const menusMap = _.chain(menus, 'ID').groupBy('ID').mapValues(v => _.head(v)).value()
  const pick = (menu, menusMap, openKeys) => {
    if (!menu) {
      return
    }
    openKeys.push(`${menu.ID}`)
    if (menu.Pid) {
      pick(menusMap[menu.Pid], menusMap, openKeys)
    }
  }
  pick(activePane, menusMap, openKeys)
  return openKeys
}
