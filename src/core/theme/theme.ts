import type { ThemeConfig } from 'antd'

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
      primaryShadow: '0 10px 24px rgba(0, 170, 183, 0.27)',
    },
    Drawer: {
      colorBgElevated: '#FFFFFF',
    },
    Input: {
      activeBorderColor: '#00AAB7',
      hoverBorderColor: '#00AAB7',
    },
  },
}
