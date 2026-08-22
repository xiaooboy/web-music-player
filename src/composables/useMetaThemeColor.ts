import { shallowRef, watch } from "vue"

function useMetaThemeColor(initColor?:string){
  const el = document.querySelector('meta[name=theme-color]') as HTMLMetaElement
  const originColor = el?.content

  const themeColor = shallowRef(initColor || originColor)

  watch(themeColor,()=>{
    if(el){
      el.content = themeColor.value
    }
  },{
    immediate: !!initColor
  })

  const setThemeColor = (color:string)=>{
    themeColor.value = color
  }
  const resetThemeColor = ()=>{
    themeColor.value = originColor
  }
  return {
    setThemeColor,
    resetThemeColor,
    themeColor
  }
}

export default useMetaThemeColor