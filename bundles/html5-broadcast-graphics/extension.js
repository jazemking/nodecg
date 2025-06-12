'use strict';

module.exports = function (nodecg) {
  // Replicants for shared state
  const activeGraphics = nodecg.Replicant('activeGraphics', { defaultValue: [] });
  const currentScene = nodecg.Replicant('currentScene', { defaultValue: null });
  const showRegions = nodecg.Replicant('showRegions', { defaultValue: false });
  const graphicsData = nodecg.Replicant('graphicsData', { 
    defaultValue: {
      topBar: {
        logo: 'F',
        title: 'FLOWICS SPORTS',
        live: true
      },
      logo: {
        icon: 'F',
        text: 'LIVE'
      },
      score: {
        homeTeam: 'EAGLES',
        awayTeam: 'LIONS',
        homeScore: 24,
        awayScore: 17,
        time: '12:45',
        period: '3rd Quarter'
      },
      social: {
        platform: 'twitter',
        username: 'SportsFan',
        handle: '@sportsfan2024',
        avatar: 'SF',
        message: 'What an incredible play! This game is going to be remembered for years to come. #ChampionshipFinal #GameOfTheCentury'
      },
      lowerThird: {
        title: 'Championship Final Tonight',
        subtitle: 'Two powerhouse teams clash in what promises to be the game of the century',
        person: 'Sarah Johnson, Sports Analyst',
        location: 'Madison Square Garden, New York'
      },
      ticker: {
        items: [
          'Breaking: Major trade deal announced between leading tech companies',
          'Weather Alert: Severe thunderstorm warning issued for metropolitan area',
          'Sports Update: Championship finals set for this weekend at the arena',
          'Market News: Stock market reaches new highs amid economic optimism',
          'Technology: New breakthrough in artificial intelligence announced by research team'
        ]
      },
      fullscreen: {
        logo: 'F',
        title: 'CHAMPIONSHIP COVERAGE',
        subtitle: 'Live from Madison Square Garden'
      }
    }
  });

  // Message handlers for dashboard communication
  nodecg.listenFor('toggleGraphic', (data) => {
    const { graphicId, isVisible } = data;
    const current = activeGraphics.value || [];
    
    if (isVisible && !current.includes(graphicId)) {
      activeGraphics.value = [...current, graphicId];
    } else if (!isVisible && current.includes(graphicId)) {
      activeGraphics.value = current.filter(id => id !== graphicId);
    }
    
    nodecg.log.info(`Graphic ${graphicId} ${isVisible ? 'shown' : 'hidden'}`);
  });

  nodecg.listenFor('setScene', (sceneId) => {
    currentScene.value = sceneId;
    
    // Define scene graphics mapping for Flowics-style scenes
    const sceneGraphics = {
      'intro': ['fullscreen-intro', 'corner-logo'],
      'main-coverage': ['top-bar', 'corner-logo', 'score-box'],
      'social-segment': ['top-bar', 'social-card', 'news-ticker'],
      'lower-third-info': ['top-bar', 'lower-third', 'corner-logo'],
      'full-graphics': ['top-bar', 'corner-logo', 'score-box', 'lower-third']
    };
    
    if (sceneId && sceneGraphics[sceneId]) {
      activeGraphics.value = sceneGraphics[sceneId];
      nodecg.log.info(`Scene changed to: ${sceneId}`);
    } else if (sceneId === null) {
      activeGraphics.value = [];
      nodecg.log.info('All graphics cleared');
    }
  });

  nodecg.listenFor('updateGraphicData', (data) => {
    const { type, updates } = data;
    const current = graphicsData.value;
    
    if (current[type]) {
      graphicsData.value = {
        ...current,
        [type]: { ...current[type], ...updates }
      };
      nodecg.log.info(`Updated ${type} data:`, updates);
    }
  });

  nodecg.listenFor('toggleRegions', (show) => {
    showRegions.value = show;
    nodecg.log.info(`Regions ${show ? 'shown' : 'hidden'}`);
  });

  nodecg.log.info('Flowics-style HTML5 Broadcast Graphics bundle loaded successfully!');
};