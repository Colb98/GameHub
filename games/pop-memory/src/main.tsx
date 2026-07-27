import ReactDOM from 'react-dom/client';
import { initGameHub } from '@gamehub/sdk';
import { App } from './App';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

initGameHub().then((gameHub) => {
  root.render(<App gameHub={gameHub} />);
});
