'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function (nodecg) {
  // Replicants for shared state
  const activeGraphics = nodecg.Replicant('activeGraphics', { defaultValue: [] });
  const currentScene = nodecg.Replicant('currentScene', { defaultValue: null });
  const showRegions = nodecg.Replicant('showRegions', { defaultValue: false });
  const graphicsData = nodecg.Replicant('graphicsData', { 
    defaultValue: {
      tickerSettings: {
        speed: 25, // seconds for full scroll
        direction: 'ltr', // 'ltr' or 'rtl'
        separator: ' *** '
      },
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

  // Function to read news ticker from file
  function loadNewsTickerFromFile() {
    try {
      const tickerFilePath = path.join(__dirname, 'newsticker.txt');
      const fileContent = fs.readFileSync(tickerFilePath, 'utf8');
      const newsItems = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      if (newsItems.length > 0) {
        const current = graphicsData.value;
        graphicsData.value = {
          ...current,
          ticker: {
            ...current.ticker,
            items: newsItems,
            lastUpdated: new Date().toISOString()
          }
        };
        nodecg.log.info(`Loaded ${newsItems.length} news items from newsticker.txt`);
      }
    } catch (error) {
      nodecg.log.warn('Could not load newsticker.txt:', error.message);
    }
  }

  // Watch for changes to the newsticker.txt file
  function watchNewsTickerFile() {
    const tickerFilePath = path.join(__dirname, 'newsticker.txt');
    
    try {
      fs.watchFile(tickerFilePath, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          nodecg.log.info('newsticker.txt file changed, reloading...');
          setTimeout(() => {
            loadNewsTickerFromFile();
            
            // Notify graphics of the change
            const current = graphicsData.value;
            if (current.ticker && current.ticker.items) {
              nodecg.sendMessage('tickerDataUpdated', {
                items: current.ticker.items,
                timestamp: new Date().toISOString()
              });
            }
          }, 100); // Small delay to ensure file write is complete
        }
      });
      nodecg.log.info('Watching newsticker.txt for changes');
    } catch (error) {
      nodecg.log.warn('Could not watch newsticker.txt:', error.message);
    }
  }

  // Load initial news ticker data
  loadNewsTickerFromFile();
  
  // Start watching the file for changes
  watchNewsTickerFile();

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

  // Handle ticker settings updates
  nodecg.listenFor('updateTickerSettings', (settings) => {
    const current = graphicsData.value;
    graphicsData.value = {
      ...current,
      tickerSettings: { ...current.tickerSettings, ...settings }
    };
    
    nodecg.log.info('Updated ticker settings:', settings);
    
    // Immediately notify graphics of the change
    nodecg.sendMessage('tickerSettingsUpdated', {
      settings: settings,
      timestamp: new Date().toISOString()
    });
  });

  // Handle file upload for ticker
  nodecg.listenFor('uploadTickerFile', (content) => {
    try {
      const tickerFilePath = path.join(__dirname, 'newsticker.txt');
      fs.writeFileSync(tickerFilePath, content, 'utf8');
      nodecg.log.info('News ticker file uploaded and saved');
      
      // Force immediate reload and notify graphics
      setTimeout(() => {
        loadNewsTickerFromFile();
        
        // Notify graphics of ticker data change
        const current = graphicsData.value;
        if (current.ticker && current.ticker.items) {
          nodecg.sendMessage('tickerDataUpdated', {
            items: current.ticker.items,
            timestamp: new Date().toISOString()
          });
        }
      }, 100);
      
      return { success: true, message: 'File uploaded successfully' };
    } catch (error) {
      nodecg.log.error('Failed to save ticker file:', error);
      return { success: false, message: error.message };
    }
  });

  nodecg.listenFor('toggleRegions', (show) => {
    showRegions.value = show;
    nodecg.log.info(`Regions ${show ? 'shown' : 'hidden'}`);
  });

  nodecg.log.info('Flowics-style HTML5 Broadcast Graphics bundle loaded successfully!');
};