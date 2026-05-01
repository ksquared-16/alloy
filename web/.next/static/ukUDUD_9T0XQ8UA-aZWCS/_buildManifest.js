self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/admin/v2",
        "destination": "/adminV2/workspace"
      },
      {
        "source": "/admin/v2/:path*",
        "destination": "/adminV2/:path*"
      },
      {
        "source": "/adminv2",
        "destination": "/adminV2/workspace"
      },
      {
        "source": "/adminv2/:path*",
        "destination": "/adminV2/:path*"
      }
    ],
    "beforeFiles": [],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()