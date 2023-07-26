(async ()=>{
    const pg = require('pg');
    const crypto = require('crypto');

    const client = new pg.Client({
        host: "0.0.0.0",
        database: "habrdb",
        user: "habrpguser",
        password: "pgpwd4habr"
    });
    
    await client.connect();
    
    console.log("Hello!");
    
    // await client.query("select ut.*,p.name as pname,p.value as pvalue from tst_tbl as ut left join usr_params as p on (ut.id=p.user_id) ").then(resp=>{
    
    //     resp.rows.map((r)=>{
    //         console.log(r);
    //     });
    
    // });
    
    
    const usrsTbl = "create table usrs (id serial, name varchar(255), primary key (id))";
    const usrsAclTbl = "create table usr_acl (id serial, usr_id int, val varchar(255))";
    const usrsAclIndex = "create index on usr_acl using hash (val)";
    const grpsTbl = "create table grps (id serial, name varchar(255), primary key (id))";
    const grpsAclTbl = "create table grp_acl (id serial, grp_id int, val varchar(255))";
    const usrsGrpsTbl = "create table usrs_grps (id serial, usr_id int, grp_id int, " + 
    "constraint fk_usr foreign key(usr_id) references usrs(id) on delete cascade, " + 
    "constraint fk_grp foreign key(grp_id) references grps(id) on delete cascade) ";

    const rights = ['-','r','w','x'];

    const getRights = () => {
        let r = crypto.randomInt(0,10);
        let w = crypto.randomInt(0,10);
        let x = crypto.randomInt(0,10);
        return `${r>5?'r':'-'}${w>5?'w':'-'}${x>5?'x':'-'}`
    }

    const acl = {
        grps: [
            {name:'admin', acl: 'rwx'},
            {name:'tech', acl: 'r-x'},
            {name:'mngr', acl: 'r-x'},
            {name:'client', acl: 'r--'},
        ],
        // usrs: [
        //     {name:'user 1', acl: 'rwx', grp: 'tech'},
        //     {name:'user 2', acl: 'rwx', grp: 'admin'},
        //     {name:'user 3', acl: 'rw-', grp: 'tech'},
        //     {name:'user 4', acl: 'r--', grp: 'client'},
        //     {name:'user 5', acl: 'r-x', grp: 'client'},
        // ],
        usrs: [],
    }

    const usrsLim = 100000;

    for (let i=1; i<=usrsLim; i++) {
        let usr_rights = getRights();
        let usr_grp = acl.grps[crypto.randomInt(0,3)].name;
        acl.usrs.push({name: `user ${i}`, acl: `${usr_rights}`, grp: `${usr_grp}`});
    }

    const grpCreate = 'insert into grps (name) values ($1) returning id';
    const usrCreate = 'insert into usrs (name) values ($1) returning id';
    const usrAclCreate = 'insert into usr_acl (usr_id,val) values ($1,$2)';
    const grpAclCreate = 'insert into grp_acl (grp_id,val) values ($1,$2)';
    try {
        await client.query('drop table if exists usrs_grps, usr_acl, grp_acl, usrs, grps');
        await client.query('BEGIN');
        await client.query(usrsTbl);
        await client.query(usrsAclTbl);
        await client.query(usrsAclIndex);
        await client.query(grpsTbl);
        await client.query(grpsAclTbl);
        await client.query(usrsGrpsTbl);
        for (grp of acl.grps) {
            let rsp = await client.query(grpCreate,[grp.name]);
            await client.query(grpAclCreate,[rsp.rows[0].id, grp.acl]);
        }
        for (usr of acl.usrs) {
            let rsp = await client.query(usrCreate,[usr.name]);
            let usr_id = rsp.rows[0].id;
            await client.query(usrAclCreate,[usr_id, usr.acl]);
            rsp = await client.query("select id from grps where name=$1::text",[usr.grp]);
            await client.query('insert into usrs_grps (usr_id, grp_id) values ($1,$2)',[usr_id, rsp.rows[0].id]);
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.log(err);
    }

    client.end();
})()