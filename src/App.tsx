import { Route, Switch } from 'wouter';
import { HomePage } from './pages/HomePage';
import { SetPage } from './pages/SetPage';
import { PrintPage } from './pages/PrintPage';

function App() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/set/:id" component={SetPage} />
      <Route path="/set/:id/print" component={PrintPage} />
      <Route>
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-4xl mb-4">🃏</div>
            <p className="text-lg font-semibold">Page not found</p>
            <a href="/" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">Go home</a>
          </div>
        </div>
      </Route>
    </Switch>
  );
}

export default App;
