import type { ThemeConfig } from 'antd'

const CONTROL_PILL_RADIUS = 999

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#00AAB7',
    colorInfo: '#00AAB7',
    colorSuccess: '#11B087',
    colorError: '#DE2C6E',
    colorBgBase: '#FFFFFF',
    colorBgContainer: '#FFFFFF',
    colorText: '#15343A',
    colorTextSecondary: '#557078',
    colorBorder: '#C9E7E9',
    colorLink: '#007F89',
    borderRadius: 16,
    borderRadiusLG: 24,
    controlHeightLG: 40,
    fontFamily: "Inter, ui-rounded, 'Segoe UI', system-ui, sans-serif",
  },
  components: {
    Button: {
      borderRadius: CONTROL_PILL_RADIUS,
      borderRadiusLG: CONTROL_PILL_RADIUS,
      borderRadiusSM: CONTROL_PILL_RADIUS,
      primaryShadow: '0 10px 24px rgba(0, 170, 183, 0.27)',
    },
    Drawer: {
      colorBgElevated: '#FFFFFF',
    },
    Input: {
      activeBorderColor: '#00AAB7',
      borderRadius: CONTROL_PILL_RADIUS,
      borderRadiusLG: CONTROL_PILL_RADIUS,
      borderRadiusSM: CONTROL_PILL_RADIUS,
      hoverBorderColor: '#00AAB7',
    },
  },
}
