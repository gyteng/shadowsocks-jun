exports.isAdmin = (req, res, next) => {
    if(req.session.isAdmin) {return next();}
    if(req.method === 'GET' && req.originalUrl.substr(0, 6) === '/admin') {
        return res.redirect('/');
    }
    return res.status(401).end();
};

exports.isUser = (req, res, next) => {
    if(req.session.user && !req.session.isAdmin) {return next();}
    if(req.method === 'GET' && req.originalUrl.substr(0, 5) === '/user') {
        return res.redirect('/');
    }
    return res.status(401).end();
};