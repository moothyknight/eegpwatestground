module.exports = {
  docs: [
    {
      type: 'category',
      label: 'Brains@Play',
      collapsed: false,
      items: [
        'intro',
        // 'design-principles'
      ],
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        {
          type: 'autogenerated',
          dirName: 'getting-started',
        },
      ],
    },
    {
      type: 'category',
      label: 'Advanced Topics',
      collapsed: true,
      items: [
        {
          type: 'autogenerated',
          dirName: 'advanced-topics',
        },
      ],
    },
    {
      type: 'category',
      label: 'Community Projects',
      collapsed: false,
      items: [
        {
          type: 'autogenerated',
          dirName: 'community-projects',
        },
      ],
    },
    // {
    //   type: 'category',
    //   label: 'Guides',
    //   items: [
    //     'guides/ethos',
    //     {
    //       Docs: [
    //       ],
    //     },
    //   ],
    // },
  ],
  api: [{type: 'autogenerated', dirName: 'reference'}],
};